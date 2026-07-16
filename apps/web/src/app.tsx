import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MapShell } from './features/map/map-shell';
import { AdminPage } from './pages/admin-page';
import { EditorPage } from './pages/editor-page';
import { PrivacyPage } from './pages/privacy-page';
import { PulseTownPage } from './pages/pulsetown-page';

export const router = createBrowserRouter([
  { path: '/', element: <MapShell /> },
  { path: '/place/:placeId', element: <MapShell /> },
  { path: '/room/:roomId', element: <MapShell /> },
  { path: '/editor', element: <EditorPage /> },
  { path: '/admin', element: <AdminPage /> },
  { path: '/pulsetown', element: <PulseTownPage /> },
  { path: '/settings/privacy', element: <PrivacyPage /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
