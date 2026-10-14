import { asWidgetYaml, communityWidget } from "@glance-editor/server";
// ADR-0028: one community widget with its variants' YAML, as the YAML tab holds a widget.
export const GET = ({ params }: { params: { dir: string } }) => {
  const w = communityWidget(params.dir);
  if (!w) return Response.json({ error: "No community widget by that name." }, { status: 404 });
  return Response.json({ ...w, variants: w.variants.map((v) => ({ ...v, yaml: asWidgetYaml(v.yaml) })) });
};
