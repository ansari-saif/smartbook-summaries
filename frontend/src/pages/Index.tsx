import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, Plus, X } from 'lucide-react';
import { Shelf, ShelfBook } from '@/components/Shelf';
import { api } from '@/api';
import { isPdfFile } from '@/lib/pdf';

interface APIBook {
  book_name: string;
  chapter_count: number;
}

const ACTIVE_JOB_KEY = 'smartbook:activeJob';
const MAX_LOG_LINES = 300;

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface JobLogLine {
  seq: number;
  time: string;
  level: string;
  message: string;
}

interface JobSummary {
  job_id: string;
  book_name: string;
  status: JobStatus;
  error: string | null;
  progress?: JobProgress | null;
}

function readActiveJob(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_JOB_KEY);
  } catch {
    return null;
  }
}

function writeActiveJob(jobId: string | null) {
  try {
    if (jobId) sessionStorage.setItem(ACTIVE_JOB_KEY, jobId);
    else sessionStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {
    // Storage can be blocked; the jobs list still rediscovers a running job.
  }
}

interface JobProgress {
  done: number;
  total: number;
  eta_seconds: number;
}

function formatEta(seconds: number) {
  if (seconds < 60) return 'Less than a minute left';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `About ${minutes} min left`;
}

function levelClass(level: string) {
  if (level === 'ERROR' || level === 'CRITICAL') return 'text-error';
  if (level === 'WARNING' || level === 'SUCCESS') return 'text-foil';
  return 'text-paper-muted';
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ChapterDraft {
  title: string;
  page: string;
  end: string;
}

function emptyChapter(): ChapterDraft {
  return { title: '', page: '', end: '' };
}

const Index = () => {
  const [books, setBooks] = useState<ShelfBook[] | null>(null);
  const [chapters, setChapters] = useState<ChapterDraft[]>([emptyChapter()]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bookName, setBookName] = useState('');
  const [contentsPage, setContentsPage] = useState('');
  const [readingContents, setReadingContents] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [formError, setFormError] = useState('');
  const [shelfError, setShelfError] = useState('');
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobLogs, setJobLogs] = useState<JobLogLine[]>([]);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([]);
  const navigate = useNavigate();
  const watchGen = useRef(0);
  const sourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);
  const localSeq = useRef(0);
  const logBoxRef = useRef<HTMLDivElement | null>(null);
  const loadBooksRef = useRef<() => Promise<void>>(async () => {});

  const loadBooks = () =>
    fetch(api('/books'))
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load books (${response.status})`);
        return response.json();
      })
      .then((data) => {
        if (data.status !== 'success' || !Array.isArray(data.books)) return;
        setShelfError('');
        setBooks(
          data.books.map((apiBook: APIBook) => ({
            bookName: apiBook.book_name,
            chapterCount: apiBook.chapter_count,
          }))
        );
      });

  loadBooksRef.current = () =>
    loadBooks().catch((error) => {
      console.error('Error fetching books:', error);
      setShelfError('The shelf could not be loaded. Check the connection and reload.');
      setBooks([]);
    });

  const refreshJobs = () =>
    fetch(api('/jobs'))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.jobs)) setRecentJobs(data.jobs);
      })
      .catch(() => {});

  const stopWatching = () => {
    sourceRef.current?.close();
    sourceRef.current = null;
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const appendLog = (line: JobLogLine) => {
    setJobLogs((prev) => {
      if (prev.some((item) => item.seq === line.seq)) return prev;
      const next = [...prev, line];
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  };

  const finishJob = async (gen: number, status: JobStatus, error: string | null) => {
    if (watchGen.current !== gen) return;
    watchGen.current += 1;
    stopWatching();
    setJobStatus(status);
    setIsSubmitting(false);
    setJobProgress(null);
    writeActiveJob(null);
    if (status === 'succeeded') {
      setFormError('');
      await loadBooksRef.current();
      setSelectedFile(null);
      setChapters([emptyChapter()]);
      setBookName('');
      setContentsPage('');
    } else if (status === 'failed') {
      setFormError(error || 'Binding failed.');
    }
    void refreshJobs();
  };

  const startPolling = (jobId: string, gen: number) => {
    const tick = async () => {
      if (watchGen.current !== gen) return;
      try {
        const response = await fetch(api(`/jobs/${jobId}`));
        if (response.status === 404) {
          await finishJob(gen, 'failed', 'That job is no longer on the server.');
          return;
        }
        if (!response.ok || watchGen.current !== gen) return;
        const data = (await response.json()) as JobSummary;
        if (watchGen.current !== gen) return;
        setJobStatus(data.status);
        if (data.progress) setJobProgress(data.progress);
        if (data.status === 'succeeded' || data.status === 'failed') {
          await finishJob(gen, data.status, data.error);
        }
      } catch {
        // Keep polling; the job is still running on the server.
      }
    };
    void tick();
    pollRef.current = window.setInterval(() => {
      void tick();
    }, 2000);
  };

  const watchJob = (jobId: string) => {
    stopWatching();
    const gen = ++watchGen.current;
    setActiveJobId(jobId);
    setJobStatus('running');
    setIsSubmitting(true);
    setFormError('');
    setJobLogs([]);
    setJobProgress(null);
    writeActiveJob(jobId);

    let errors = 0;
    const source = new EventSource(api(`/jobs/${jobId}/events`));
    sourceRef.current = source;

    source.addEventListener('log', (event) => {
      if (watchGen.current !== gen) return;
      errors = 0;
      try {
        appendLog(JSON.parse((event as MessageEvent).data) as JobLogLine);
        setJobStatus('running');
      } catch {
        // Ignore a malformed log event and keep the stream.
      }
    });

    source.addEventListener('progress', (event) => {
      if (watchGen.current !== gen) return;
      errors = 0;
      try {
        setJobProgress(JSON.parse((event as MessageEvent).data) as JobProgress);
      } catch {
        // Ignore a malformed progress event and keep the stream.
      }
    });

    source.addEventListener('status', (event) => {
      if (watchGen.current !== gen) return;
      try {
        const data = JSON.parse((event as MessageEvent).data) as {
          status: JobStatus;
          error?: string | null;
        };
        void finishJob(gen, data.status, data.error ?? null);
      } catch {
        void finishJob(gen, 'failed', 'Binding failed.');
      }
    });

    source.onerror = () => {
      if (watchGen.current !== gen || pollRef.current !== null) return;
      errors += 1;
      if (errors < 3) return;
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
      localSeq.current -= 1;
      appendLog({
        seq: localSeq.current,
        time: '',
        level: 'WARNING',
        message: 'Connection lost, checking status…',
      });
      startPolling(jobId, gen);
    };
  };

  useEffect(() => {
    const box = logBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [jobLogs]);

  useEffect(() => {
    loadBooksRef.current();
    void refreshJobs();

    const stored = readActiveJob();
    let cancelled = false;
    if (stored) {
      void (async () => {
        try {
          const response = await fetch(api(`/jobs/${stored}`));
          if (cancelled) return;
          if (response.status === 404) {
            writeActiveJob(null);
            return;
          }
          if (!response.ok) return;
          const data = (await response.json()) as JobSummary;
          if (cancelled) return;
          if (data.status === 'queued' || data.status === 'running') {
            watchJob(stored);
            return;
          }
          writeActiveJob(null);
          setJobStatus(data.status);
          if (data.status === 'succeeded') {
            await loadBooksRef.current();
          } else if (data.status === 'failed') {
            setFormError(data.error || 'Binding failed.');
          }
        } catch {
          // The jobs list below can still rediscover a running job.
        }
      })();
    }

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // Restore once on mount. watchJob/refreshJobs close over stable setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptPdf = (file: File | undefined | null) => {
    if (!isPdfFile(file)) {
      setUploadError('That is not a PDF. Choose a .pdf file.');
      return;
    }
    setUploadError('');
    setSelectedFile(file);
    setBookName(file.name.replace(/\.pdf$/i, ''));
    setChapters([emptyChapter()]);
    setContentsPage('');
    setFormError('');
  };

  const handleDrag = (event: React.DragEvent<HTMLLabelElement>, over: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(over);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    handleDrag(event, false);
    acceptPdf(event.dataTransfer.files?.[0]);
  };

  const updateChapter = (index: number, patch: Partial<ChapterDraft>) =>
    setChapters((prev) => prev.map((chapter, i) => (i === index ? { ...chapter, ...patch } : chapter)));

  const filled = chapters.filter((chapter) => chapter.title.trim() || chapter.page.trim() || chapter.end.trim());
  const numbered = filled
    .map((chapter) => Number(chapter.page))
    .filter((page) => Number.isInteger(page) && page >= 1);
  const pagesInOrder = numbered.every((page, index) => index === 0 || page >= numbered[index - 1]);
  const chaptersReady =
    filled.length > 0 &&
    filled.every((chapter) => {
      const from = Number(chapter.page);
      const to = Number(chapter.end);
      return chapter.title.trim() && Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from;
    }) &&
    pagesInOrder;
  const contentsValid = Number(contentsPage) >= 1;
  const ready = !!selectedFile && !!bookName.trim() && chaptersReady && !readingContents;

  const readContents = async () => {
    if (!selectedFile || !contentsValid || readingContents) return;
    setReadingContents(true);
    setFormError('');
    const formData = new FormData();
    formData.append('pdf_file', selectedFile);
    formData.append('contents_page', contentsPage);
    try {
      const response = await fetch(api('/contents'), { method: 'POST', body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.chapters)) {
        const detail = typeof data.detail === 'string' ? data.detail : `Could not read the contents (${response.status})`;
        throw new Error(detail);
      }
      setChapters(
        data.chapters.map((chapter: { title?: string; page?: number | null; end?: number | null }) => ({
          title: chapter.title ?? '',
          page: chapter.page == null ? '' : String(chapter.page),
          end: chapter.end == null ? '' : String(chapter.end),
        })),
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not read the contents.');
    } finally {
      setReadingContents(false);
    }
  };

  const handleBind = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !selectedFile) return;

    setIsSubmitting(true);
    setFormError('');
    setJobStatus('queued');
    setJobLogs([]);

    const formData = new FormData();
    formData.append('pdf_file', selectedFile);
    formData.append(
      'chapters',
      JSON.stringify(
        filled.map((chapter) => ({
          title: chapter.title.trim(),
          page: Number(chapter.page),
          end: Number(chapter.end),
        })),
      ),
    );
    formData.append('book_name', bookName.trim());

    try {
      const response = await fetch(api('/process-pdf'), {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.job_id !== 'string') {
        const detail = typeof data.detail === 'string' ? data.detail : `Binding failed (${response.status})`;
        throw new Error(detail);
      }
      watchJob(data.job_id);
      void refreshJobs();
    } catch (error) {
      console.error('Error:', error);
      setIsSubmitting(false);
      setJobStatus(null);
      setFormError(error instanceof Error ? error.message : 'Binding failed.');
    }
  };

  const openBook = (name: string) => navigate(`/summary?book=${encodeURIComponent(name)}`);

  return (
    <div className="cloth min-h-[100dvh]">
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8 md:pt-16">
        <header className="flex flex-col items-center text-center">
          <span className="headband h-1.5 w-24 rounded-full" aria-hidden />
          <h1 className="foil mt-5 text-4xl font-medium sm:text-5xl md:text-6xl" style={{ letterSpacing: '0.22em' }}>
            Smartbook
          </h1>
          <p className="mt-3 font-read text-lg italic text-paper-muted">
            Keep the meaning, cut the fluff.
          </p>
        </header>

        <section aria-labelledby="shelf-heading" className="mt-12 md:mt-16">
          <h2 id="shelf-heading" className="stamp-label mb-5">
            Your shelf
          </h2>
          {books === null ? (
            <div className="headband band-run h-1 w-full opacity-60" aria-label="Loading the shelf" />
          ) : books.length > 0 ? (
            <Shelf books={books} onOpen={openBook} />
          ) : (
            <p className="max-w-md font-read text-base leading-relaxed text-paper-muted">
              {shelfError || 'Nothing on the shelf yet. Bind your first book below.'}
            </p>
          )}
        </section>

        <section
          aria-labelledby="bind-heading"
          className="mt-16 rounded-[4px] bg-black/25 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] sm:p-8 md:mt-24"
        >
          <h2 id="bind-heading" className="foil text-xl font-medium">
            Bind a new book
          </h2>
          <p className="mt-2 max-w-prose font-read text-base leading-relaxed text-paper-muted">
            Give it a PDF and the contents page. Each chapter is rewritten in plain English with a
            short summary at the end.
          </p>

          {recentJobs.length > 0 && (
            <div className="mt-6">
              <h3 className="stamp-label mb-2">Processing and recent</h3>
              <ul className="space-y-1">
                {recentJobs.map((job) => {
                  const live = job.status === 'queued' || job.status === 'running';
                  const label = `${job.book_name} · ${job.status}${job.error ? ` — ${job.error}` : ''}`;
                  return (
                    <li key={job.job_id} className="font-stamp text-sm text-paper-muted">
                      {live ? (
                        <button
                          type="button"
                          onClick={() => watchJob(job.job_id)}
                          className={`text-left hover:text-foil hover:underline ${
                            job.job_id === activeJobId ? 'text-foil' : 'text-paper'
                          }`}
                        >
                          {label}
                        </button>
                      ) : (
                        <span>{label}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <form onSubmit={handleBind} className="mt-8 grid gap-7 md:grid-cols-2 md:gap-x-10">
            <div className="md:row-span-2">
              <span className="stamp-label mb-2 block">PDF</span>
              <label
                className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-[3px] border-[1.5px] border-dashed px-5 py-8 text-center transition-colors md:h-[calc(100%-1.5rem)] ${
                  isDragging
                    ? 'border-foil bg-foil/10'
                    : selectedFile
                      ? 'border-foil/70 bg-black/20'
                      : 'border-foil/35 hover:border-foil/70'
                }`}
                onDragOver={(e) => handleDrag(e, true)}
                onDragEnter={(e) => handleDrag(e, true)}
                onDragLeave={(e) => handleDrag(e, false)}
                onDrop={handleDrop}
              >
                <FileUp className="h-8 w-8 text-foil" strokeWidth={1.5} aria-hidden />
                {selectedFile ? (
                  <>
                    <span className="mt-3 break-words font-stamp text-base text-paper">{selectedFile.name}</span>
                    <span className="mt-1 font-stamp text-xs text-paper-muted">
                      {formatSize(selectedFile.size)} · choose another
                    </span>
                  </>
                ) : (
                  <span className="mt-3 font-stamp text-base text-paper-muted">
                    {isDragging ? 'Let go to add the PDF' : 'Drop the PDF here, or choose a file'}
                  </span>
                )}
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,application/pdf"
                  onChange={(e) => acceptPdf(e.target.files?.[0])}
                />
              </label>
              {uploadError && (
                <p className="mt-2 font-stamp text-sm text-error" role="alert">
                  {uploadError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="bookName" className="stamp-label mb-2 block">
                Title
              </label>
              <input
                id="bookName"
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
                placeholder="The 7 Habits of Highly Effective People"
                className="field"
                autoComplete="off"
              />
            </div>

            <fieldset>
              <legend className="stamp-label mb-2">Contents page</legend>
              <div className="flex items-center gap-3">
                <input
                  id="contentsPage"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={contentsPage}
                  onChange={(e) => setContentsPage(e.target.value)}
                  placeholder="20"
                  aria-label="Contents page"
                  className="field w-28 tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => void readContents()}
                  disabled={!selectedFile || !contentsValid || readingContents}
                  className="foil-line h-12 px-4"
                >
                  {readingContents ? 'Reading…' : 'Read contents'}
                </button>
              </div>
              <p className="mt-2 font-stamp text-sm text-paper-muted">
                The page number shown in the PDF viewer where the table of contents starts.
              </p>
            </fieldset>

            <fieldset className="md:col-span-2">
              <legend className="stamp-label mb-1">Chapters</legend>
              <p className="mb-3 font-stamp text-sm text-paper-muted">
                Each row is a chapter with the PDF pages it covers. Remove any you do not want bound.
              </p>
              {filled.length > 1 && !pagesInOrder && (
                <p className="mb-3 font-stamp text-sm text-error">Chapter pages have to stay in order.</p>
              )}
              <ol className="space-y-2">
                {chapters.map((chapter, index) => {
                  return (
                    <li key={index} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-right font-stamp text-sm tabular-nums text-foil/80">
                        {index + 1}
                      </span>
                      <input
                        value={chapter.title}
                        onChange={(e) => updateChapter(index, { title: e.target.value })}
                        placeholder={index === 0 ? 'Habit 1: Be Proactive' : 'Chapter title'}
                        aria-label={`Chapter ${index + 1} title`}
                        className="field min-w-0 flex-1"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={chapter.page}
                        onChange={(e) => updateChapter(index, { page: e.target.value })}
                        placeholder="From"
                        aria-label={`Chapter ${index + 1} from`}
                        className="field w-20 shrink-0 tabular-nums"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={chapter.end}
                        onChange={(e) => updateChapter(index, { end: e.target.value })}
                        placeholder="To"
                        aria-label={`Chapter ${index + 1} to`}
                        className="field w-20 shrink-0 tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => setChapters((prev) => prev.filter((_, i) => i !== index))}
                        disabled={chapters.length === 1}
                        aria-label={`Remove chapter ${index + 1}`}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[3px] text-paper-muted transition-colors hover:bg-black/30 hover:text-paper disabled:opacity-30 sm:h-11 sm:w-11"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                onClick={() => setChapters((prev) => [...prev, emptyChapter()])}
                className="foil-line mt-3 h-11 px-4 sm:ml-8"
              >
                <Plus className="h-4 w-4" />
                Add chapter
              </button>
            </fieldset>

            <div className="md:col-span-2">
              <button type="submit" className="foil-plate h-12 w-full sm:w-auto sm:px-10" disabled={!ready || isSubmitting}>
                {isSubmitting ? 'Binding…' : 'Bind book'}
              </button>
              {(isSubmitting || jobLogs.length > 0) && (
                <div className="mt-4 max-w-prose">
                  {isSubmitting && <div className="headband band-run h-1 w-full rounded-full" aria-hidden />}
                  <p className="mt-3 font-stamp text-sm text-paper-muted" role="status">
                    {isSubmitting
                      ? 'Each chapter is being rewritten. You can refresh this page; processing continues and the log reconnects.'
                      : jobStatus === 'succeeded'
                        ? 'Binding finished.'
                        : 'Binding stopped.'}
                  </p>
                  {isSubmitting && jobProgress && jobProgress.total > 0 && (
                    <p className="mt-1 font-stamp text-sm text-paper">
                      {formatEta(jobProgress.eta_seconds)} · {jobProgress.done} of {jobProgress.total}
                    </p>
                  )}
                  {jobLogs.length > 0 && (
                    <div
                      ref={logBoxRef}
                      role="log"
                      aria-live="polite"
                      aria-relevant="additions"
                      className="mt-3 max-h-56 overflow-y-auto rounded-[3px] bg-black/40 px-3 py-2"
                    >
                      {jobLogs.map((line) => (
                        <p key={line.seq} className="font-stamp text-xs leading-relaxed text-paper">
                          <span className={`${levelClass(line.level)} mr-2 inline-block w-16`}>{line.level}</span>
                          <span className="whitespace-pre-wrap">{line.message}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {formError && (
                <p className="mt-3 font-stamp text-sm text-error" role="alert">
                  {formError}
                </p>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Index;
