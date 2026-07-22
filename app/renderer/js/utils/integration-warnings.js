/**
 * Shows integration-related warnings after task sync
 * @param {import('vue').default} vue Vue component instance
 * @param {Array<{integration: string, code?: string, message?: string|null}>} [warnings]
 */
export function showIntegrationWarnings(vue, warnings) {

  if (!warnings?.length) {
    return;
  }

  warnings.forEach((warning) => {

    if (warning.integration !== 'gitlab') {
      return;
    }

    const messageKey = warning.code === 'server_error'
      ? 'gitlab.warning.server_error'
      : 'gitlab.warning.token_expired';

    vue.$alert(
      warning.message || vue.$t(messageKey),
      vue.$t('gitlab.warning.title'),
      {
        type: 'warning',
        confirmButtonText: vue.$t('OK'),
      },
    );

  });

}

/**
 * Fetches GitLab integration warnings once and shows them to the user
 * @param {import('vue').default} vue Vue component instance
 */
export async function fetchAndShowIntegrationWarnings(vue) {

  try {

    const res = await vue.$ipc.request('integrations/gitlab-warnings', {});

    if (res.code === 200) {
      showIntegrationWarnings(vue, res.body.warnings);
    }

  } catch (_) {
    // Do not block startup if integration status check fails
  }

}
