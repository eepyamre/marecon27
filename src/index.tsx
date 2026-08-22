import { MainLayout } from '@/layouts/MainLayout';
import '@/styles.scss';
import {
  LocationProvider,
  hydrate,
  prerender as ssr,
  useLocation,
} from 'preact-iso';

import {
  Archive,
  Comfy,
  FAQ,
  HQ,
  Home,
  Mascots,
  Nawni,
  Office,
  Schedule,
  Smiley,
  Vendors,
} from './pages';

export const routes = {
  ['/']: Home,
  ['/faq']: FAQ,
  ['/archive']: Archive,
  ['/hq']: HQ,
  ['/mascots']: Mascots,
  ['/nawni']: Nawni,
  ['/smiley']: Smiley,
  ['/comfy']: Comfy,
  ['/schedule']: Schedule,
  ['/vendors']: Vendors,
};

const Root = () => {
  const { path } = useLocation();
  if (path.startsWith('/office')) return <Office />;
  return <MainLayout />;
};

export const App = () => {
  return (
    <LocationProvider>
      <Root />
    </LocationProvider>
  );
};

if (typeof window !== 'undefined') {
  hydrate(<App />, document.getElementById('app'));
}

export async function prerender(data) {
  return await ssr(<App {...data} />);
}
