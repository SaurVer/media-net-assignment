import {handleApi} from '../../../lib/server';

export const dynamic='force-dynamic';
type Context={params:Promise<{path?:string[]}>};
const route=async(request:Request,context:Context)=>handleApi(request,(await context.params).path??[]);
export {route as GET,route as POST,route as PUT,route as DELETE};
