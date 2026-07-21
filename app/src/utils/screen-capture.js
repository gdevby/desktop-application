const { BrowserWindow, desktopCapturer, screen } = require('electron');
const Log = require('./log');
const { UIError } = require('./errors');

const log = new Log('ScreenCapture');

/**
 * Captures all available screens and returns a single JPEG buffer.
 *
 * The image data comes from the desktopCapturer thumbnail. This is the most
 * reliable capture path with the xdg-desktop-portal on Electron 33 + Wayland.
 * A single offscreen BrowserWindow is created *before* the portal session
 * starts and is reused for stitching, because creating a renderer after the
 * PipeWire portal session has started can cause crashes in this Electron
 * / PipeWire combination.
 * @return {Promise<Buffer>} JPEG screenshot buffer
 */
const captureScreens = async () => {

  const timeStart = Date.now();

  // Gather the real display geometry so we can request a thumbnail that is
  // large enough for the biggest monitor and then scale each source back to
  // its native resolution before stitching.
  const displays = screen.getAllDisplays();
  const maxDisplayWidth = Math.max(...displays.map(d => d.size.width));
  const maxDisplayHeight = Math.max(...displays.map(d => d.size.height));

  // Create the stitching window before the portal session starts.
  const stitchWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true,
    },
  });

  await stitchWindow.loadURL('about:blank');

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxDisplayWidth, height: maxDisplayHeight },
  });

  if (!sources || sources.length === 0)
    throw new UIError(500, 'No screen sources were found', 'ESCR504');

  const captures = sources.map((source, index) => {

    // Match the source to a display. When the portal gives us a display_id,
    // use it; otherwise fall back to the source index.
    const display = source.display_id
      ? displays.find(d => String(d.id) === String(source.display_id))
      : displays[index];

    const targetSize = display
      ? { width: display.size.width, height: display.size.height }
      : source.thumbnail.getSize();

    return {
      width: targetSize.width,
      height: targetSize.height,
      dataUrl: source.thumbnail.toDataURL(),
    };

  });

  const totalWidth = captures.reduce((sum, capture) => sum + capture.width, 0);
  const maxHeight = Math.max(...captures.map(capture => capture.height));

  const images = captures.map(capture => ({
    url: capture.dataUrl,
    width: capture.width,
    height: capture.height,
  }));

  const dataUrl = await stitchWindow.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = ${totalWidth};
      canvas.height = ${maxHeight};
      const ctx = canvas.getContext('2d');
      const images = ${JSON.stringify(images)};
      let loaded = 0;
      let x = 0;
      const drawNext = () => {
        if (loaded === images.length) {
          resolve(canvas.toDataURL('image/jpeg', 0.5));
          return;
        }
        const { url, width, height } = images[loaded];
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, x, 0, width, height);
          x += width;
          loaded += 1;
          drawNext();
        };
        img.onerror = reject;
        img.src = url;
      };
      drawNext();
    })
  `);

  stitchWindow.close();

  if (dataUrl.indexOf('data:image/jpeg;base64,') !== 0) {

    log.error('ESCR503', 'Incorrect screenshot data URL signature received');
    throw new UIError(500, 'Screenshot with incorrect signature captured', 'ESCR503');

  }

  log.debug(`Captured in ${(Date.now() - timeStart)}ms`);
  return Buffer.from(dataUrl.substring(23), 'base64');

};

/**
 * Persistent screen capture session.
 *
 * Starts a single desktop media stream and keeps it alive while the tracker
 * is active. On Wayland this causes the xdg-desktop-portal permission dialog
 * to be shown only once, because the PipeWire stream is reused for every
 * screenshot instead of starting a new portal session each time.
 */
class CaptureSession {
  constructor() {
    this.captureWindow = null;
    this.active = false;
    this.initializing = false;
    this.sources = [];
  }

  /**
   * Start the session.
   *
   * Creates a hidden renderer, requests the available screen sources once,
   * and starts a getUserMedia stream for the selected source(s).
   * @return {Promise<void>}
   */
  async start() {
    if (this.active || this.initializing) return;
    this.initializing = true;

    try {
      // Create the window before the portal session starts. Creating a new
      // renderer after the PipeWire portal session has started caused crashes
      // in this Electron / PipeWire combination during testing.
      this.captureWindow = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          offscreen: false,
          backgroundThrottling: false,
        },
      });

      await this.captureWindow.loadFile(require('path').join(__dirname, 'screen-capture.html'));

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 },
      });

      if (!sources || sources.length === 0)
        throw new UIError(500, 'No screen sources were found', 'ESCR504');

      // On Wayland the portal usually returns a single source for the whole
      // desktop, so we use only that source. On X11 and other platforms we
      // keep all sources so multi-monitor stitching still works.
      const isWayland = process.platform === 'linux' && !!process.env.WAYLAND_DISPLAY;
      this.sources = isWayland ? [sources[0]] : sources;

      const sourceIds = this.sources.map(s => s.id);

      const initResult = await this.captureWindow.webContents.executeJavaScript(`
        (async () => {
          if (window.__cattrCaptureSession) return 'already-initialized';

          const streams = [];
          for (const sourceId of ${JSON.stringify(sourceIds)}) {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: sourceId,
                },
              },
            });
            stream.getVideoTracks().forEach(track => {
              track.onended = () => {
                if (window.__cattrCaptureSession) {
                  window.__cattrCaptureSession.trackEnded = true;
                }
              };
            });
            streams.push(stream);
          }

          window.__cattrCaptureSession = {
            streams,
            trackEnded: false,
          };

          return { streamCount: streams.length };
        })()
      `);

      log.debug(`Capture session started: ${JSON.stringify(initResult)}`);
      this.active = true;
    } catch (err) {
      log.error('Failed to start capture session', err);
      this.dispose();
      throw err;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Capture a frame from the active stream(s).
   *
   * The frames are drawn onto a canvas and returned as a JPEG buffer.
   * @return {Promise<Buffer>} JPEG screenshot buffer
   */
  async capture() {
    if (!this.active || !this.captureWindow)
      throw new UIError(500, 'Capture session is not active', 'ESCR506');

    const sources = this.sources;

    const dataUrl = await this.captureWindow.webContents.executeJavaScript(`
      (async () => {
        const session = window.__cattrCaptureSession;
        if (!session) throw new Error('Session not initialized');
        if (session.trackEnded) throw new Error('Capture track ended');

        const captures = [];
        for (let i = 0; i < session.streams.length; i += 1) {
          const stream = session.streams[i];
          const track = stream.getVideoTracks()[0];
          if (!track || track.readyState === 'ended') {
            throw new Error('Capture track ended');
          }

          let bitmap;
          if (window.ImageCapture) {
            const imageCapture = new ImageCapture(track);
            bitmap = await imageCapture.grabFrame();
          } else {
            // Fallback for renderers where ImageCapture is not exposed.
            const video = document.createElement('video');
            video.srcObject = stream;
            video.play();
            await new Promise((resolve, reject) => {
              video.onloadedmetadata = resolve;
              video.onerror = reject;
              setTimeout(() => reject(new Error('Video metadata timeout')), 5000);
            });
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            bitmap = await createImageBitmap(canvas);
            video.pause();
            video.srcObject = null;
          }

          captures.push({
            bitmap,
            width: bitmap.width,
            height: bitmap.height,
            sourceId: ${JSON.stringify(sources.map(s => s.id))}[i],
          });
        }

        const totalWidth = captures.reduce((sum, c) => sum + c.width, 0);
        const maxHeight = Math.max(...captures.map(c => c.height));

        const canvas = document.createElement('canvas');
        canvas.width = totalWidth;
        canvas.height = maxHeight;
        const ctx = canvas.getContext('2d');

        let x = 0;
        for (const capture of captures) {
          ctx.drawImage(capture.bitmap, x, 0);
          capture.bitmap.close && capture.bitmap.close();
          x += capture.width;
        }

        return canvas.toDataURL('image/jpeg', 0.5);
      })()
    `);

    if (dataUrl.indexOf('data:image/jpeg;base64,') !== 0) {
      log.error('ESCR503', 'Incorrect screenshot data URL signature received');
      throw new UIError(500, 'Screenshot with incorrect signature captured', 'ESCR503');
    }

    return Buffer.from(dataUrl.substring(23), 'base64');
  }

  /**
   * Stop the session and release all resources.
   * @return {Promise<void>}
   */
  async stop() {
    if (this.captureWindow) {
      try {
        await this.captureWindow.webContents.executeJavaScript(`
          (() => {
            const session = window.__cattrCaptureSession;
            if (session && session.streams) {
              session.streams.forEach(stream => {
                stream.getTracks().forEach(track => track.stop());
              });
            }
            window.__cattrCaptureSession = null;
          })()
        `);
      } catch (err) {
        log.error('Error stopping capture session tracks', err);
      }
      this.captureWindow.close();
      this.captureWindow = null;
    }
    this.active = false;
    this.initializing = false;
    this.sources = [];
  }

  /**
   * Dispose of the session, logging any errors instead of throwing.
   */
  dispose() {
    try {
      this.stop();
    } catch (err) {
      log.error('Error disposing capture session', err);
    }
  }
}

module.exports = { captureScreens, CaptureSession };
