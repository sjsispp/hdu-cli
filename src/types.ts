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

export type PhoneCategory = "all" | "administration" | "academic" | "support" | "affiliated" | "research";
export type BusCampus = "xiasha" | "shaoxing";
export type ClassCampus = BusCampus | "qingshanhu";

export interface ServiceLink {
  name: string;
  url: string;
}

export interface PhoneContact {
  role: string;
  phone: string;
}

export interface PhoneOffice {
  id: string;
  category: Exclude<PhoneCategory, "all">;
  categoryName: string;
  name: string;
  contacts: PhoneContact[];
  url: string;
}

export interface BusTrip {
  campus: BusCampus;
  section?: string;
  schedule?: string;
  direction: string;
  time: string;
  vehicle?: string;
  route: string;
  url: string;
}

export interface BusSchedule {
  source: "hdu-main";
  campus: BusCampus;
  notes: string[];
  trips: BusTrip[];
  url: string;
}

export interface ClassPeriod {
  campus: ClassCampus;
  session: string;
  name: string;
  time: string;
}

export interface ClassSchedule {
  source: "hdu-main";
  campus: ClassCampus;
  periods: ClassPeriod[];
  url: string;
}

/** 1 = first (autumn) term, 2 = second (spring) term, 3 = third (summer) term. */
export type JwTermNumber = 1 | 2 | 3;

export interface JwTerm {
  /** Starting calendar year of the academic year, e.g. 2026 for 2026-2027. */
  year: number;
  term: JwTermNumber;
  /** Human-readable form such as 2026-2027-1. */
  label: string;
}

export interface JwProfile {
  source: "hdu-jw";
  /** Academic fields only; identity documents and other sensitive personal data are never included. */
  fields: Record<string, string>;
}

export interface JwCourse {
  name: string;
  courseCode?: string;
  teacher?: string;
  /** 1 = Monday … 7 = Sunday; absent for courses without a fixed slot. */
  weekday?: number;
  weekdayName?: string;
  periods?: string;
  weeks?: string;
  location?: string;
  campus?: string;
  credit?: string;
}

export interface JwTimetable {
  source: "hdu-jw";
  term: JwTerm;
  courses: JwCourse[];
  /** Practical or online courses that have no fixed weekly slot. */
  unscheduled: JwCourse[];
}

export interface JwGrade {
  term: string;
  courseName: string;
  courseCode?: string;
  credit?: string;
  score: string;
  gradePoint?: string;
  courseNature?: string;
  examNature?: string;
}

export interface JwGrades {
  source: "hdu-jw";
  term?: JwTerm;
  items: JwGrade[];
}

export interface JwExam {
  courseName: string;
  examName?: string;
  time?: string;
  location?: string;
  campus?: string;
  seat?: string;
}

export interface JwExams {
  source: "hdu-jw";
  term: JwTerm;
  items: JwExam[];
  /** Courses whose exam has not been scheduled yet. */
  unscheduled: { courseName: string; courseCode?: string; examName?: string; credit?: string; department?: string }[];
}

export interface JwTeachingWeek {
  week: number;
  /** ISO dates (YYYY-MM-DD), Monday to Sunday. */
  start: string;
  end: string;
}

export interface JwWeekTimetable {
  source: "hdu-jw";
  term: JwTerm;
  week: JwTeachingWeek;
  courses: JwCourse[];
}

export interface JwDay {
  source: "hdu-jw";
  date: string;
  weekday: number;
  term: JwTerm;
  /** Absent outside the teaching calendar (e.g. during holidays). */
  week?: JwTeachingWeek;
  courses: JwCourse[];
}

export interface JwProgressCategory {
  id: string;
  parentId?: string;
  name: string;
  requiredCredits: number;
  earnedCredits: number;
  satisfied: boolean;
}

export interface JwProgressCourse {
  name: string;
  courseCode?: string;
  credit?: string;
  status: "in_progress" | "not_taken" | "other";
  /** Term the plan suggests taking the course in, e.g. 2026-2027-2. */
  plannedTerm?: string;
}

export interface JwOutstandingCategory {
  id: string;
  name: string;
  path: string[];
  requiredCredits: number;
  earnedCredits: number;
  missingCredits: number;
  courses: JwProgressCourse[];
}

export interface JwProgress {
  source: "hdu-jw";
  gpa?: number;
  courseCounts?: { planned: number; passed: number; failed: number; notTaken: number; inProgress: number };
  categories: JwProgressCategory[];
  /** Unmet categories whose parents are also unmet; an unmet child of a satisfied parent is an untaken alternative. */
  outstanding: JwOutstandingCategory[];
}

export interface JwRoom {
  name: string;
  building?: string;
  seats?: number;
  examSeats?: number;
  type?: string;
  campus?: string;
}

export interface JwRooms {
  source: "hdu-jw";
  term: JwTerm;
  campus: string;
  week: number;
  weekday: number;
  periods: number[];
  rooms: JwRoom[];
}

export interface JwCourseOffering {
  courseCode: string;
  name: string;
  className: string;
  credit?: string;
  teachers: string[];
  schedule?: string;
  location?: string;
  campus?: string;
  enrolled?: number;
  capacity?: number;
  department?: string;
  courseNature?: string;
  assessment?: string;
  weeks?: string;
}

export interface JwCourseOfferings {
  source: "hdu-jw";
  term: JwTerm;
  total: number;
  items: JwCourseOffering[];
}

export interface JwSelection {
  courseCode?: string;
  name: string;
  className?: string;
  credit?: string;
  teachers: string[];
  courseNature?: string;
  category?: string;
  department?: string;
  weeks?: string;
  selectedAt?: string;
  selectionRound?: string;
  retake: boolean;
}

export interface JwSelections {
  source: "hdu-jw";
  term: JwTerm;
  items: JwSelection[];
}

export interface JwThesis {
  source: "hdu-jw";
  topics: { title: string; advisor?: string; advisorTitle?: string; department?: string; term?: string; keywordStatus?: string }[];
  defenses: { stage: string; advisor?: string; term?: string }[];
}
