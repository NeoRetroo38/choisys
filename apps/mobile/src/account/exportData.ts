import { Platform, Share } from 'react-native';
import type { ExportResponse } from '@scenarys/shared';

/** Hands the export to the person: a .json download on the web, the share sheet on iPhone. */
export async function deliverExport(data: ExportResponse): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const name = `choisys-${data.exportedAt.slice(0, 10)}.json`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ title: name, message: json });
}
