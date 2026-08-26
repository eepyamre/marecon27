// import { routes } from '@/index';
// import { NotFound, Schedule } from '@/pages';
// import { signal } from '@preact/signals';
// import { Route, Router } from 'preact-iso';

// import {
//   HijackScreen,
//   HotBatAd,
//   Navigation,
//   Notebook,
//   Tooltip,
// } from '@/components';

// import logo from '@/assets/logo1.webp';

// import css from './styles.module.scss';

// export const showTooltip = signal(false);
// export const tooltipRef = signal<HTMLDivElement | null>(null);

// export const MainLayout = () => {
//   return (
//     <HijackScreen>
//       <main>
//         <Navigation />
//         <img src={logo} alt="Logo" class={css.logo} />
//         <Notebook>
//           <div class={css.pages}>
//             <Router>
//               {Object.entries(routes).map(([key, value]) => (
//                 <Route key={key} path={key} component={value} />
//               ))}
//               <Schedule path={'/schedule/friday'} day="friday" />
//               <Schedule path={'/schedule/sunday'} day="sunday" />
//               <Schedule path={'/schedule/saturday'} day="saturday" />

//               <Route default component={NotFound} />
//             </Router>
//           </div>
//         </Notebook>
//         {showTooltip.value && (
//           <Tooltip
//             ref={(data) => {
//               tooltipRef.value = data;
//             }}
//           />
//         )}
//         <HotBatAd />
//       </main>
//     </HijackScreen>
//   );
// };
