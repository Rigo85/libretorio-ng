import {File, FileKind} from '../core/headers';

export function bookFixture(): File {
  return {
    id: 1, name: 'sample.pdf', parentPath: '/books', parentHash: 'local-test',
    size: '1 KB', coverId: '00000000-0000-4000-8000-000000000001',
    fileKind: FileKind.FILE, customDetails: true,
    webDetails: {title: 'Sample book', author_name: ['Local author']}
  };
}
