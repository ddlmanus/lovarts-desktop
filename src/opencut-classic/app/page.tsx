import { Hero } from "@/opencut-classic/components/landing/hero";
import { Header } from "@/opencut-classic/components/header";
import { Footer } from "@/opencut-classic/components/footer";
import type { Metadata } from "next";
import { SITE_URL } from "@/opencut-classic/site/brand";

export const metadata: Metadata = {
	alternates: {
		canonical: SITE_URL,
	},
};

export default async function Home() {
	return (
		<div>
			<Header />
			<Hero />
			<Footer />
		</div>
	);
}
