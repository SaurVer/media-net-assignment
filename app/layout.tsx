import type {Metadata} from 'next';
import '@fontsource-variable/inter';
import './globals.css';
export const metadata:Metadata = {
  title:'Head start the anticipation engine',
  description:'A workspace for handing off work across time zones.',
};
export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
