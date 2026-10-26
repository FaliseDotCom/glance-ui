import { communityWidgetView } from "@glance-editor/server";
// ADR-0028, ADR-0030: one community widget with its variants' YAML, as the YAML tab holds a widget, and a field for each value.
export const GET = ({ params }: { params: { dir: string } }) => {
  const w = communityWidgetView(params.dir);
  return w ? Response.json(w) : Response.json({ error: "No community widget by that name." }, { status: 404 });
};
