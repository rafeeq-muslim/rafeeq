import { describe, expect, it } from "vitest"

import type { LibraryItemData, LibraryTopic } from "@/app/discover/types"
import { libraryPick } from "./useOrganized"

const item = (id: string) => ({ id, title: id }) as LibraryItemData
const TOPICS: LibraryTopic[] = [
  { id: "u1", unit: "u1", title: "دليل اليوم الأول", items: [item("wudu-video")] },
  { id: "u3", unit: "u3", title: "أركان الإسلام", items: [item("hajj-book"), item("ramadan-guide")] },
  { id: "general", unit: null, items: [item("new-muslim-guide")] },
]

describe("knw-06-r2 library topics are the path's units (PLT-09 «يناسب وحدته» card)", () => {
  it("knw06_r2_plt09_card_picks_an_item_of_the_learners_current_unit", () => {
    expect(libraryPick(TOPICS, "u3")?.id).toBe("hajj-book")
    expect(libraryPick(TOPICS, "u1")?.id).toBe("wudu-video")
  })

  it("knw06_r2_unit_without_library_items_falls_back_to_general", () => {
    expect(libraryPick(TOPICS, "u2")?.id).toBe("new-muslim-guide")
    expect(libraryPick(TOPICS, undefined)?.id).toBe("new-muslim-guide")
  })

  it("knw06_r2_no_items_means_no_card", () => {
    expect(libraryPick([{ id: "general", unit: null, items: [] }], "u2")).toBeNull()
    expect(libraryPick(undefined, "u1")).toBeNull()
  })
})
