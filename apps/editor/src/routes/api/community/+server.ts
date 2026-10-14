import { communityList } from "@glance-editor/server";
// ADR-0028: the community widgets bundled with this release, without their YAML.
export const GET = () => Response.json(communityList());
