import { json } from "#lib/server/editor.ts";
export const GET = ({ params }: { params: { n: string } }) =>
  json((e) => e.version(Number(params.n)) ?? Promise.reject(new Error(`There is no version ${params.n}.`)));
