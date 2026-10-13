import { json } from "#lib/server/editor.ts";
export const POST = ({ params }: { params: { n: string } }) => json((e) => e.restore(Number(params.n)));
