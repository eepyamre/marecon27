import '@/styles.scss';
import { LocationProvider, hydrate, prerender as ssr } from 'preact-iso';

import { Office } from './pages';

// export const routes = {
//   ['/']: Office,
// };

const Root = () => {
  // const { path } = useLocation();
  // if (path.startsWith('/office')) return <Office />;
  // return <MainLayout />;
  return <Office />;
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
