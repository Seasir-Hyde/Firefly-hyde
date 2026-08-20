<script lang="ts">
import TabNav from "@/components/common/TabNav.svelte";
import type { MalCategory } from "@/utils/mal-utils";
import MalSection from "./MalSection.svelte";

interface Props {
	categories: MalCategory[];
	initialActiveCategory?: string;
	animeBaseUrl?: string;
	mangaBaseUrl?: string;
}

const {
	categories,
	initialActiveCategory,
	animeBaseUrl = "https://myanimelist.net/anime/",
	mangaBaseUrl = "https://myanimelist.net/manga/",
}: Props = $props();

let activeCategory = $state("");

// 初始化 activeCategory / 当 initialActiveCategory 变化时重置状态
$effect(() => {
	if (initialActiveCategory) {
		activeCategory = initialActiveCategory;
	} else if (categories[0]?.id) {
		activeCategory = categories[0].id;
	}
});

function handleCategoryChange(categoryId: string) {
	activeCategory = categoryId;
}
</script>

{#if categories.length > 0}
  <TabNav tabs={categories} activeTab={activeCategory} onTabChange={handleCategoryChange} />

  {#each categories as category (category.id)}
    <MalSection
      sectionId={category.id}
      items={category.items}
      isActive={category.id === activeCategory}
      itemsPerPage={24}
      kind={category.id}
      baseUrl={category.id === "manga" ? mangaBaseUrl : animeBaseUrl}
    />
  {/each}
{/if}
