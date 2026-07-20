import path from "node:path";
import type { NextConfig } from "next";

const DEFAULT_API_URL =
	process.env.NODE_ENV === "production"
		? "https://api.hbxsystem.com.br"
		: "http://localhost:3000";

const nextConfig: NextConfig = {
	// Upload grande (vídeo do tutorial etc.) passa pelo rewrite /hbx/api → o Next 16
	// limita o corpo PROXIADO a 10MB por padrão. nginx (80m nos 2 server blocks) e o
	// multer do backend (TUTORIAL_MAX_BYTES = 80MB) já aceitam 80 — alinhamos o proxy.
	experimental: {
		proxyClientMaxBodySize: "80mb",
	},
	// NEXT_DIST_DIR permite um segundo dev server (preview do Claude) sem
	// brigar pelo .next do dev principal — ver script dev:preview.
	...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
	turbopack: {
		root: path.resolve(__dirname),
	},
	async headers() {
		const isProd = process.env.NODE_ENV === "production";
		const headerList: { key: string; value: string }[] = [
			{ key: "X-Frame-Options", value: "SAMEORIGIN" },
			{ key: "X-Content-Type-Options", value: "nosniff" },
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
			{
				key: "Permissions-Policy",
				// microphone=(self): libera o mic só p/ a própria origem (nota de voz no /atendimento). camera/geo seguem off.
				value: "camera=(), microphone=(self), geolocation=(self)",
			},
			// CSP fica como follow-up (report-only): o app usa scripts inline
			// via dangerouslySetInnerHTML (service worker + boot de tema) e login Google.
		];
		if (isProd) {
			headerList.push({
				key: "Strict-Transport-Security",
				value: "max-age=31536000; includeSubDomains",
			});
		}
		return [{ source: "/:path*", headers: headerList }];
	},
	async rewrites() {
		const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
		return [
			{
				source: "/hbx/api/:path*",
				destination: `${backendUrl}/:path*`,
			},
			{
				source: "/hbx/static/:path*",
				destination: `${backendUrl}/webscraping/static/:path*`,
			},
			{
				source: "/hbx/webscraping/:path*",
				destination: `${backendUrl}/webscraping/:path*`,
			},
			{
				source: "/hbx/webscraping",
				destination: `${backendUrl}/webscraping`,
			},
		];
	},
};

export default nextConfig;
