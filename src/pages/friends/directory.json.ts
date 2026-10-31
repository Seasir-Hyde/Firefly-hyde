import type { APIRoute } from "astro";
import { friendsConfig, friendsProjects } from "../../config/friendsConfig";

export const prerender = true;

export const GET: APIRoute = () =>
	new Response(
		JSON.stringify(
			[...friendsConfig, ...friendsProjects]
				.filter((friend) => friend.enabled)
				.map((friend) => ({ ...friend, applicationId: null })),
		),
		{ headers: { "Content-Type": "application/json; charset=utf-8" } },
	);
