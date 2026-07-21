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

    vue.$message({
      type: 'warning',
      message: vue.$t('GitLab token expired. Update it in Cattr web settings to resume task sync.'),
    });

  });

}
