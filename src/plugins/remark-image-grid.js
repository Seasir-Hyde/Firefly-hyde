import { visit } from "unist-util-visit";

/**
 * Custom Remark plugin for creating responsive image grids.
 *
 * It parses markdown blocks surrounded by `[grid]` and `[/grid]` tags and wraps
 * the contained images in a styled `div` container with a grid layout.
 * The column count is evaluated automatically based on the number of inserted images
 * inside the grid tags (up to 4 columns).
 *
 * Grids are processed not only at the document root but also inside nested block
 * containers (admonitions, blockquotes, lists, directives, MDX JSX components),
 * so `[grid]` / `[/grid]` blocks keep working when placed inside such containers,
 * for example in the children of `<TimelineItem>` or `<StepItem>` in `.mdx` posts.
 *
 * Example:
 * [grid]
 * ![image1](/url1)
 * ![image2](/url2)
 * [/grid]
 *
 * @returns {import('unified').Plugin}
 */

// Block containers that may hold block-level content such as a `[grid]` block.
// Admonitions appear as `containerDirective` (`:::note`) or `blockquote`
// (Python-style `!!!note`) nodes at this stage of the pipeline. In MDX, the
// children of a JSX component (e.g. `<TimelineItem>`) are `mdxJsxFlowElement`
// nodes, so they must be listed here as well.
const BLOCK_CONTAINER_TYPES = new Set([
	"root",
	"blockquote",
	"containerDirective",
	"list",
	"listItem",
	"mdxJsxFlowElement",
]);

/** Resolve the responsive column class for a grid with the given image count. */
function getGridColumnClass(imgCount) {
	const cols = imgCount || 2;
	if (cols === 1) return "md:grid-cols-1";
	if (cols === 2) return "md:grid-cols-2";
	if (cols === 3) return "md:grid-cols-3";
	return "md:grid-cols-4";
}

/** Count all images found inside the given nodes, recursively. */
function countImages(nodes) {
	let imgCount = 0;
	nodes.forEach((node) => {
		visit(node, "image", () => {
			imgCount++;
		});
	});
	return imgCount;
}

/** Wrap the given nodes into a grid `div` paragraph node. */
function buildGridNode(nodes) {
	return {
		type: "paragraph",
		data: {
			hName: "div",
			hProperties: {
				className: [
					"image-grid",
					"grid",
					"grid-cols-1",
					getGridColumnClass(countImages(nodes)),
					"gap-4",
					"my-4",
				],
			},
		},
		children: nodes,
	};
}

/**
 * Detach the paragraph text that sits before an opening `[grid]` marker on its
 * own line. Markdown joins adjacent lines into a single paragraph, so
 * `正文` followed directly by `[grid]` would otherwise keep the marker buried
 * inside that paragraph and the grid would never be recognized.
 *
 * The node is mutated in place (the marker is moved to the start of its first
 * text node) and the detached leading paragraph is returned, if any.
 */
function detachLeadingText(node) {
	const first = node.children[0];
	if (first?.type !== "text") return null;

	const match = first.value.match(/^([\s\S]*?)\n[ \t]*\[grid\][ \t]*(?=\n|$)/);
	if (!match || match[1].trim() === "") return null;

	first.value = first.value.slice(match[1].length + 1);
	return { type: "paragraph", children: [{ type: "text", value: match[1] }] };
}

/**
 * Detach the paragraph text that sits after a closing `[/grid]` marker, i.e.
 * `[/grid]` followed by more text within the same paragraph. Same reasoning as
 * {@link detachLeadingText}; returns the detached trailing paragraph, if any.
 */
function detachTrailingText(node) {
	const last = node.children[node.children.length - 1];
	if (last?.type !== "text") return null;

	const match = last.value.match(/\[\/grid\][ \t]*\n([\s\S]+)$/);
	if (!match || match[1].trim() === "") return null;

	last.value = last.value
		.slice(0, last.value.length - match[1].length)
		.trimEnd();
	return { type: "paragraph", children: [{ type: "text", value: match[1] }] };
}

/**
 * Split paragraphs that carry surrounding text into separate blocks so the
 * `[grid]` / `[/grid]` markers end up on paragraph boundaries and the grid
 * detection below can work on them.
 */
function detachParagraphText(children) {
	const result = [];

	for (const node of children) {
		if (node.type !== "paragraph" || node.children.length === 0) {
			result.push(node);
			continue;
		}

		const leading = detachLeadingText(node);
		const trailing = detachTrailingText(node);

		if (leading) result.push(leading);
		result.push(node);
		if (trailing) result.push(trailing);
	}

	return result;
}

/**
 * Process `[grid]` / `[/grid]` blocks within a flat list of block children.
 * Returns a new children array with grids replaced by grid `div` nodes.
 */
function processGridBlocks(children) {
	const blocks = detachParagraphText(children);

	const newChildren = [];
	let inGrid = false;
	let gridChildren = [];

	for (let i = 0; i < blocks.length; i++) {
		const node = blocks[i];

		// Check if paragraph contains [grid] or [/grid]
		if (node.type === "paragraph" && node.children.length > 0) {
			const first = node.children[0];
			const last = node.children[node.children.length - 1];

			let containsGridStart = false;
			let containsGridEnd = false;

			if (first.type === "text" && first.value.trim().startsWith("[grid]")) {
				containsGridStart = true;
			}
			if (last.type === "text" && last.value.trim().endsWith("[/grid]")) {
				containsGridEnd = true;
			}

			// Case 1: [grid] and [/grid] in the SAME paragraph
			if (containsGridStart && containsGridEnd && !inGrid) {
				first.value = first.value.replace(/^\s*\[grid\]\s*/, "");
				last.value = last.value.replace(/\s*\[\/grid\]\s*$/, "");

				// count images in the grid
				const imgCount = node.children.filter(
					(n) =>
						n.type === "image" ||
						(n.type === "link" &&
							n.children &&
							n.children.some((c) => c.type === "image")),
				).length;
				const cols = imgCount || 2;
				const mdColClass = getGridColumnClass(cols);

				newChildren.push({
					type: "paragraph",
					data: {
						hName: "div",
						hProperties: {
							className: [
								"image-grid",
								"grid",
								"grid-cols-1",
								mdColClass,
								"gap-4",
								"my-4",
							],
						},
					},
					children: node.children.filter(
						(n) => n.type !== "text" || n.value.trim() !== "",
					), // Remove empty text nodes left over
				});
				continue;
			}

			// Case 2: Multi-paragraph
			if (!inGrid && containsGridStart) {
				inGrid = true;
				first.value = first.value.replace(/^\s*\[grid\]\s*/, "");
				if (node.children.length === 1 && first.value.trim() === "") {
					// [grid] stood alone, ignore this node
				} else {
					gridChildren.push(node);
				}
				continue;
			}

			if (inGrid && containsGridEnd) {
				inGrid = false;
				last.value = last.value.replace(/\s*\[\/grid\]\s*$/, "");
				if (node.children.length === 1 && last.value.trim() === "") {
					// [/grid] stood alone
				} else {
					gridChildren.push(node);
				}

				newChildren.push(buildGridNode(gridChildren));
				gridChildren = [];
				continue;
			}
		}

		if (inGrid) {
			gridChildren.push(node);
		} else {
			newChildren.push(node);
		}
	}

	// If unclosed, just append them
	if (inGrid) {
		newChildren.push(...gridChildren);
	}

	return newChildren;
}

export function remarkImageGrid() {
	return (tree) => {
		// Process grids inside nested block containers (admonitions, blockquotes,
		// lists, MDX JSX components, ...) as well as at the document root. Children
		// are processed first (depth-first) so inner grids are already wrapped when
		// an outer container scans its own children.
		const processContainer = (node) => {
			if (Array.isArray(node.children)) {
				for (const child of node.children) {
					processContainer(child);
				}
			}
			// A self-closing MDX JSX element (e.g. `<Divider />`) has no block children.
			if (
				BLOCK_CONTAINER_TYPES.has(node.type) &&
				Array.isArray(node.children)
			) {
				node.children = processGridBlocks(node.children);
			}
		};

		processContainer(tree);
	};
}
