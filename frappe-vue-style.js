import { promises as fs } from "fs";

export default function frappeVueStyle() {
        return {
                name: "frappe-vue-style",
                async transform(code, id) {
                        if (!id.endsWith(".vue")) {
                                return null;
                        }
                        const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
                        if (styleMatch) {
                                const stylePath = id + ".css";
                                await fs.writeFile(stylePath, styleMatch[1]);
                        }
                        return null;
                },
        };
}
