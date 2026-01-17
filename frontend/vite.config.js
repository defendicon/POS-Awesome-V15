import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import frappeVueStyle from "../frappe-vue-style";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildVersion = process.env.POSAWESOME_BUILD_VERSION || Date.now().toString();

function posawesomeBuildVersionPlugin(version) {
	return {
		name: "posawesome-build-version",
		apply: "build",
		async writeBundle() {
			const versionFile = path.resolve(__dirname, "../posawesome/public/dist/js/version.json");
			await fs.mkdir(path.dirname(versionFile), { recursive: true });
			await fs.writeFile(versionFile, JSON.stringify({ version }, null, 2), "utf8");
		},
	};
}

export default defineConfig({
	base: "/assets/posawesome/dist/js/",
	plugins: [
		posawesomeBuildVersionPlugin(buildVersion),
		frappeVueStyle(),
		vue(),
		viteStaticCopy({
			targets: [
				{
					src: "src/posapp/workers",
					dest: "posapp",
				},
				{
					src: "src/libs/*",
					dest: "libs",
				},
				{
					src: "src/offline/*",
					dest: "offline",
				},
				{
					src: "src/sw.js",
					dest: "../www",
					transform(contents) {
						return contents.replace(/__BUILD_VERSION__/g, buildVersion);
					},
				},
				{
					src: "src/loader.js",
					dest: ".",
					transform(contents) {
						return contents.replace(/__BUILD_VERSION__/g, buildVersion);
					},
				},
			],
		}),
	],
	css: {
		postcss: {
			plugins: [tailwindcss(), autoprefixer()],
		},
	},
	build: {
		target: "esnext",
		outDir: "../posawesome/public/dist/js",
		emptyOutDir: true,
		cssCodeSplit: false,
		rollupOptions: {
			input: {
				posawesome: path.resolve(__dirname, "src/posawesome.bundle.js"),
			},
			external: ["socket.io-client"],
			output: {
				format: "es",
				entryFileNames: "[name].js",
				chunkFileNames: "[name]-[hash].js",
				assetFileNames: "posawesome.[ext]",
				manualChunks: (id) => {
					if (id.includes("node_modules")) {
						if (id.includes("vuetify")) {
							return "vuetify";
						}
						if (id.includes("vue")) {
							return "vue";
						}
						return "vendor";
					}
				},
			},
		},
	},
	worker: {
		format: "es",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	define: {
		__BUILD_VERSION__: JSON.stringify(buildVersion),
		"process.env.NODE_ENV": '"production"',
		process: '{"env":{}}',
	},
});
