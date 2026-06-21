const GITHUB_API_BASE = "https://api.github.com";

export interface ExternalMoment {
	id: string;
	content: string;
	published: string;
	images?: string[];
	tags?: string[];
	location?: string;
	pinned?: boolean;
	author?: string;
	avatar?: string;
}

export interface NotebookData {
	entries: Array<{
		id: string;
		notebook: string;
		title: string;
		date: string;
		content: string;
		createdAt: string;
		updatedAt: string;
	}>;
	metadata: {
		name: string;
		summary?: string;
	};
}

export async function getGistContent(
	gistId: string,
	fileName: string,
	token?: string,
): Promise<string | null> {
	const headers: HeadersInit = {};
	if (token) {
		headers["Authorization"] = `token ${token}`;
	}

	try {
		const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
			headers,
		});
		if (!response.ok) {
			return null;
		}
		const gist = await response.json();
		const file = gist.files[fileName];
		return file?.content || null;
	} catch {
		return null;
	}
}

export async function getGistContentRaw(
	gistId: string,
	fileName: string,
): Promise<string | null> {
	try {
		const response = await fetch(
			`https://gist.githubusercontent.com/raw/${gistId}/${fileName}`,
		);
		if (!response.ok) {
			return null;
		}
		return await response.text();
	} catch {
		return null;
	}
}

export async function updateGist(
	gistId: string,
	fileName: string,
	content: string,
	token: string,
): Promise<boolean> {
	const headers: HeadersInit = {
		Authorization: `token ${token}`,
		"Content-Type": "application/json",
	};

	const body = JSON.stringify({
		files: {
			[fileName]: {
				content: content,
			},
		},
	});

	try {
		const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
			method: "PATCH",
			headers,
			body,
		});
		return response.ok;
	} catch {
		return false;
	}
}

export async function createGist(
	fileName: string,
	content: string,
	token: string,
	isPublic = false,
): Promise<string | null> {
	const headers: HeadersInit = {
		Authorization: `token ${token}`,
		"Content-Type": "application/json",
	};

	const body = JSON.stringify({
		public: isPublic,
		files: {
			[fileName]: {
				content: content,
			},
		},
	});

	try {
		const response = await fetch(`${GITHUB_API_BASE}/gists`, {
			method: "POST",
			headers,
			body,
		});
		if (!response.ok) {
			return null;
		}
		const gist = await response.json();
		return gist.id;
	} catch {
		return null;
	}
}

export async function deleteGist(
	gistId: string,
	token: string,
): Promise<boolean> {
	const headers: HeadersInit = {
		Authorization: `token ${token}`,
	};

	try {
		const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
			method: "DELETE",
			headers,
		});
		return response.ok;
	} catch {
		return false;
	}
}

export async function getMomentsFromGist(
	gistId: string,
	fileName: string,
): Promise<ExternalMoment[]> {
	const content = await getGistContentRaw(gistId, fileName);
	if (!content) {
		return [];
	}

	try {
		return JSON.parse(content);
	} catch {
		return [];
	}
}

export async function updateMomentsInGist(
	gistId: string,
	fileName: string,
	moments: ExternalMoment[],
	token: string,
): Promise<boolean> {
	const content = JSON.stringify(moments, null, 2);
	return updateGist(gistId, fileName, content, token);
}

export async function getNotebookFromGist(
	gistId: string,
): Promise<NotebookData | null> {
	const content = await getGistContentRaw(gistId, "notebooks-entries.json");
	if (!content) {
		return null;
	}

	try {
		return JSON.parse(content);
	} catch {
		return null;
	}
}

export async function updateNotebookInGist(
	gistId: string,
	data: NotebookData,
	token: string,
): Promise<boolean> {
	const content = JSON.stringify(data, null, 2);
	return updateGist(gistId, "notebooks-entries.json", content, token);
}

export async function createNotebookGist(
	name: string,
	token: string,
): Promise<string | null> {
	const data: NotebookData = {
		entries: [],
		metadata: {
			name,
			summary: "记录每天的所思所想",
		},
	};
	const content = JSON.stringify(data, null, 2);
	return createGist("notebooks-entries.json", content, token, false);
}

export function generateId(prefix = "ext"): string {
	return `${prefix}-${Date.now()}`;
}

export async function validateGitHubToken(token: string): Promise<boolean> {
	const headers: HeadersInit = {
		Authorization: `token ${token}`,
	};

	try {
		const response = await fetch(`${GITHUB_API_BASE}/user`, { headers });
		return response.ok;
	} catch {
		return false;
	}
}
