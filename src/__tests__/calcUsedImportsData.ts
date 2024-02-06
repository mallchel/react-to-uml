export const treeComponentsUMLMap = new Map([
  ['/app/services/DocumentService.ts', []],
  [
    '/app/components/Application/Application.tsx',
    ['/app/components/Modals/Modals.tsx', '/app/components/Thumbnails/Thumbnails.tsx'],
  ],
  [
    '/app/components/Application/ApplicationMobile.tsx',
    ['/app/components/Thumbnails/ThumbnailsMobile.tsx', '/app/components/Modals/Modals.tsx'],
  ],
  [
    '/app/components/index.ts',
    [
      '/app/components/ModalsBackdrop.tsx',
      '/app/components/ModalVisibilityProvider.tsx',
      '/app/components/Tools/SVGTool.tsx',
      '/app/components/Modals/Modals.tsx',
      '/app/components/Portal/index.tsx',
    ],
  ],
  ['/custom-library/index.js', []],
  [
    '/app/components/Thumbnails/Thumbnails.tsx',
    ['/app/components/Thumbnails/ThumbnailsFooter.tsx'],
  ],
  [
    '/app/components/Thumbnails/ThumbnailsMobile.tsx',
    ['/app/components/Thumbnails/ThumbnailsMobileFooter.tsx'],
  ],
  [
    '/app/components/Modals/Modals.tsx',
    [
      '/app/components/Modals/PageDeletingWarningModalProvider/PageDeletingWarningModalProvider.js',
      '/app/components/Modals/Attachment/Attachment.tsx',
    ],
  ],
  ['/app/components/Thumbnails/ThumbnailsFooter.tsx', ['/custom-library/index.js']],
  ['/app/components/Thumbnails/ThumbnailsMobileFooter.tsx', ['/custom-library/index.js']],
  [
    '/app/components/Modals/Attachment/Attachment.tsx',
    ['/app/components/Modals/Attachment/Desktop/Desktop.tsx'],
  ],
  ['/app/components/Modals/Attachment/Desktop/Desktop.tsx', ['/custom-library/index.js']],
  [
    '/app/Root.js',
    [
      '/app/components/Application/Application.tsx',
      '/app/components/Application/ApplicationMobile.tsx',
      '/app/components/Application/PassedToProps.tsx',
      '/custom-library/index.js',
    ],
  ],
]);
