export type MainSiteSection = "notices" | "events" | "news";

export interface ListItem {
  id: string;
  source: "hdu-main";
  section: MainSiteSection;
  title: string;
  publishedAt?: string;
  summary?: string;
  url: string;
  external: boolean;
}

export interface ListResult {
  source: "hdu-main";
  section: MainSiteSection;
  page: number;
  totalPages?: number;
  items: ListItem[];
}

export interface Attachment {
  title: string;
  url: string;
}

export interface Article {
  id: string;
  source: "hdu-main";
  title: string;
  publishedAt?: string;
  publisher?: string;
  url: string;
  content: string;
  attachments: Attachment[];
}

export interface DeadlineMatch {
  rawDate: string;
  evidence: string;
}

export interface ArticleDeadlines {
  article: Pick<Article, "id" | "title" | "publishedAt" | "url">;
  matches: DeadlineMatch[];
}

export type JobSiteSection = "notices" | "talks" | "fairs" | "positions";
export type JobPositionType = "all" | "fulltime" | "intern";

export interface JobSiteItem {
  id: string;
  source: "hdu-job";
  section: JobSiteSection;
  title: string;
  url: string;
  publishedAt?: string;
  company?: string;
  location?: string;
  startsAt?: string;
  mode?: string;
  salary?: string;
  positionType?: string;
  education?: string;
}

export interface JobSiteListResult {
  source: "hdu-job";
  section: JobSiteSection;
  page: number;
  totalPages?: number;
  authenticated: boolean;
  items: JobSiteItem[];
}

export interface JobSiteArticle {
  id: string;
  source: "hdu-job";
  title: string;
  url: string;
  content: string;
  metadata: Record<string, string>;
  attachments: Attachment[];
  authenticated: boolean;
}
