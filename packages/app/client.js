import { createRoot } from 'react-dom/client';

import { Root } from './Root';

const clientRun = () => {
  const content = document.getElementById('content');
  const root = createRoot(content);

  root.render(<Root />);
};

clientRun();
