import type { JwThesis } from "../types.js";
import { jwQuery, PAGE_ALL, rows, text } from "./jw.js";

/** Advisor names come as "姓名(工号)"; keep the name only. */
function advisorName(value: unknown): string | undefined {
  return text(value)?.replace(/\s*[(（]\d+[)）]\s*$/, "");
}

export function parseThesis(process: unknown, defenses: unknown): JwThesis {
  return {
    source: "hdu-jw",
    topics: rows(process, "items").map((row) => ({
      title: text(row.ktmc) ?? text(row.yktmc) ?? "未命名课题",
      advisor: advisorName(row.kt_jg_xm),
      advisorTitle: text(row.kt_zc_mc),
      department: text(row.kt_zgjg_mc),
      term: [text(row.xn_mc), text(row.xq_mc)].filter(Boolean).join("-") || undefined,
      keywordStatus: text(row.gjcqrztmc)
    })),
    defenses: rows(defenses, "items").map((row) => ({
      stage: text(row.dblxmc) ?? "答辩",
      advisor: advisorName(row.kt_jg_xm),
      term: [text(row.xnmmc), text(row.xqmmc)].filter(Boolean).join("-") || undefined
    }))
  };
}

export async function getThesis(): Promise<JwThesis> {
  const [process, defenses] = await Promise.all([
    jwQuery("/xsbysjgl/xsgczl_cxXsgczlIndex.html?doType=query&gnmkdm=N532540", { xnm_cx: "", xqm_cx: "", ...PAGE_ALL }),
    jwQuery("/xsbysjgl/dbxxck_cxDbxxckIndex.html?doType=query&gnmkdm=N532550", { xnm: "", xqm: "", ...PAGE_ALL })
  ]);
  return parseThesis(process, defenses);
}
