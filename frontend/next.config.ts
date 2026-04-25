import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	turbopack: {
		root: path.resolve(__dirname),
	},
	async rewrites() {
		const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
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
