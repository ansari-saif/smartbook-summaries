import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Download, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { api } from '@/api';
import { Ribbon } from '@/components/Shelf';
import {
  chapterStorageKey,
  focusStorageKey,
  place,
  scrollStorageKey,
  storedChapter,
} from '@/lib/binding';

interface BookDetails {
  book_name: string;
  data: Record<string, string>;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-paper">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

const BODY = 'text-[1.0625rem] leading-[1.75] text-paper/90 sm:text-lg';
const SUBHEAD = 'pt-4 font-read text-xl font-semibold leading-snug text-paper';

function FormattedChapter({ text, title }: { text: string; title: string }) {
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let orderedList: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    // Keep inline "1. ... 2. ..." runs as separate lines when the model
    // forgot newlines between numbered points.
    const joined = paragraph.join(' ');
    const inlineNumbered = joined.split(/(?=\b\d+\.\s+)/).map((part) => part.trim()).filter(Boolean);
    const looksNumbered =
      inlineNumbered.length > 1 && inlineNumbered.every((part) => /^\d+\.\s+/.test(part));

    if (looksNumbered) {
      blocks.push(
        <ol key={`ol-${blocks.length}`} className={`list-decimal space-y-2 pl-6 marker:text-foil/80 ${BODY}`}>
          {inlineNumbered.map((item, index) => (
            <li key={index}>{renderInline(item.replace(/^\d+\.\s+/, ''))}</li>
          ))}
        </ol>
      );
    } else {
      blocks.push(
        <p key={`p-${blocks.length}`} className={BODY}>
          {renderInline(joined)}
        </p>
      );
    }
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className={`list-disc space-y-2 pl-6 marker:text-foil/80 ${BODY}`}>
        {list.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  const flushOrderedList = () => {
    if (orderedList.length === 0) return;
    blocks.push(
      <ol key={`ol-${blocks.length}`} className={`list-decimal space-y-2 pl-6 marker:text-foil/80 ${BODY}`}>
        {orderedList.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ol>
    );
    orderedList = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushOrderedList();
  };

  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line || line === '---') {
      flushAll();
      return;
    }
    if (/^here is the text rewritten/i.test(line)) return;
    if (/^-\s+".+"\s+→/.test(line)) return;
    if (line.toLowerCase() === title.toLowerCase()) return;
    if (/^summary\s*:/i.test(line)) {
      flushAll();
      blocks.push(
        <div key={`h-${blocks.length}`} className="pt-8">
          <div className="headband h-1 w-16 rounded-full" aria-hidden />
          <h3 className="foil mt-4 text-sm font-medium">Summary</h3>
        </div>
      );
      return;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushAll();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className={SUBHEAD}>
          {heading[1]}
        </h3>
      );
      return;
    }
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      flushAll();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className={SUBHEAD}>
          {line.slice(2, -2)}
        </h3>
      );
      return;
    }
    const numbered = line.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      flushList();
      orderedList.push(numbered[1]);
      return;
    }
    const bullet = line.match(/^[*-]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushOrderedList();
      list.push(bullet[1]);
      return;
    }
    flushList();
    flushOrderedList();
    paragraph.push(line);
  });

  flushAll();

  return <div className="space-y-5 font-read">{blocks}</div>;
}

const LoadingScreen = () => (
  <div className="cloth flex min-h-[100dvh] items-center justify-center px-6">
    <div className="w-full max-w-xs text-center" role="status">
      <p className="foil text-sm font-medium">Opening the book</p>
      <div className="headband band-run mt-4 h-1 w-full rounded-full" aria-hidden />
    </div>
  </div>
);

function detailsStorageKey(book: string) {
  return `smartbook-details:${book}`;
}

function loadCachedDetails(book: string | null): BookDetails | null {
  if (!book) return null;
  try {
    const raw = sessionStorage.getItem(detailsStorageKey(book));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookDetails;
    if (parsed?.book_name && parsed?.data && typeof parsed.data === 'object') {
      return parsed;
    }
  } catch {
    // ignore bad cache
  }
  return null;
}

const Summary = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookName = searchParams.get('book');

  const cachedDetails = loadCachedDetails(bookName);
  const [bookDetails, setBookDetails] = useState<BookDetails | null>(cachedDetails);
  const [isLoading, setIsLoading] = useState(!cachedDetails);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [isFocus, setIsFocus] = useState(
    () => !!bookName && place.get(focusStorageKey(bookName)) === '1'
  );
  const [currentChapter, setCurrentChapter] = useState(() => (bookName ? storedChapter(bookName) ?? 0 : 0));
  const [scrollPercent, setScrollPercent] = useState(0);
  const [percentVisible, setPercentVisible] = useState(false);
  const percentTimerRef = useRef<number | null>(null);
  const readerRef = useRef<HTMLElement>(null);
  const bookDetailsRef = useRef(bookDetails);
  const currentChapterRef = useRef(currentChapter);
  bookDetailsRef.current = bookDetails;
  currentChapterRef.current = currentChapter;

  const updateScrollPercent = (el: HTMLElement) => {
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) {
      setScrollPercent(100);
      return;
    }
    setScrollPercent(Math.min(100, Math.max(0, Math.round((el.scrollTop / max) * 100))));
  };

  const showPercentBriefly = () => {
    setPercentVisible(true);
    if (percentTimerRef.current !== null) window.clearTimeout(percentTimerRef.current);
    percentTimerRef.current = window.setTimeout(() => {
      setPercentVisible(false);
      percentTimerRef.current = null;
    }, 3000);
  };

  useEffect(
    () => () => {
      if (percentTimerRef.current !== null) window.clearTimeout(percentTimerRef.current);
    },
    []
  );

  const saveReaderScroll = (el?: HTMLElement | null) => {
    const node = el ?? readerRef.current;
    const details = bookDetailsRef.current;
    if (!node || !details) return;
    const chapter = Object.keys(details.data)[currentChapterRef.current];
    if (!chapter) return;
    place.set(scrollStorageKey(details.book_name, chapter), String(Math.round(node.scrollTop)));
  };

  const restoreReaderScroll = () => {
    const details = bookDetailsRef.current;
    const el = readerRef.current;
    if (!el || !details) return;
    const chapter = Object.keys(details.data)[currentChapterRef.current];
    if (!chapter) return;
    const raw = place.get(scrollStorageKey(details.book_name, chapter));
    const top = raw == null ? 0 : Number(raw);
    const apply = () => {
      if (!readerRef.current) return;
      readerRef.current.scrollTop = Number.isFinite(top) ? top : 0;
      updateScrollPercent(readerRef.current);
    };
    requestAnimationFrame(() => requestAnimationFrame(apply));
  };

  // Horizontal only: scrollIntoView would also move the page vertically.
  const scrollChipIntoView = useCallback(
    (node: HTMLButtonElement | null) => {
      const strip = node?.closest('nav');
      if (!node || !strip || strip.scrollWidth <= strip.clientWidth) return;
      const offset = node.getBoundingClientRect().left - strip.getBoundingClientRect().left;
      const left = strip.scrollLeft + offset - (strip.clientWidth - node.offsetWidth) / 2;
      strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentChapter]
  );

  const selectChapter = (index: number) => {
    saveReaderScroll();
    setCurrentChapter(index);
  };

  const setFocus = (next: boolean) => {
    saveReaderScroll();
    setIsFocus(next);
  };

  useEffect(() => {
    if (!bookName) {
      navigate('/');
      return;
    }

    let cancelled = false;
    const hasCache = !!loadCachedDetails(bookName);
    if (!hasCache) setIsLoading(true);

    fetch(api(`/book-details?book_name=${encodeURIComponent(bookName)}`))
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.status === 'success') {
          const next = {
            book_name: data.book_name as string,
            data: data.data as Record<string, string>,
          };
          setBookDetails(next);
          sessionStorage.setItem(detailsStorageKey(bookName), JSON.stringify(next));
          const maxChapter = Object.keys(next.data).length;
          setCurrentChapter((prev) => (prev >= maxChapter ? 0 : prev));
        } else if (!hasCache) {
          navigate('/');
        }
      })
      .catch((error) => {
        console.error('Error fetching book details:', error);
        if (!cancelled && !hasCache) navigate('/');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookName, navigate]);

  useEffect(() => {
    if (!bookName) return;
    place.set(focusStorageKey(bookName), isFocus ? '1' : '0');
  }, [bookName, isFocus]);

  useEffect(() => {
    if (!bookName) return;
    place.set(chapterStorageKey(bookName), String(currentChapter));
  }, [bookName, currentChapter]);

  useEffect(() => {
    if (!isFocus) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocus(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocus]);

  useEffect(() => {
    if (!bookDetails) return;
    restoreReaderScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, bookDetails, isFocus]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveReaderScroll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const handleDownloadPDF = async () => {
    if (!bookDetails) return;
    const chapterName = Object.keys(bookDetails.data)[currentChapter];
    setIsDownloading(true);
    setDownloadError('');
    try {
      const response = await fetch(
        api(`/chapter-pdf?book_name=${encodeURIComponent(bookDetails.book_name)}&chapter_name=${encodeURIComponent(chapterName)}`)
      );
      if (!response.ok) throw new Error('PDF download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bookDetails.book_name}-${chapterName}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      setDownloadError('The chapter PDF could not be downloaded. Try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading && !bookDetails) {
    return <LoadingScreen />;
  }

  if (!bookDetails) return null;

  const chapters = Object.keys(bookDetails.data);
  const chapterName = chapters[currentChapter];
  const next = currentChapter + 1 < chapters.length ? currentChapter + 1 : null;
  const prev = currentChapter > 0 ? currentChapter - 1 : null;

  return (
    <div className="cloth flex h-[100dvh] flex-col">
      {!isFocus && (
        <header className="flex min-h-14 shrink-0 items-center gap-2 px-2 py-1 sm:h-16 sm:gap-4 sm:px-4 sm:py-0">
          <Link
            to="/"
            onClick={() => saveReaderScroll()}
            className="flex h-11 shrink-0 items-center gap-2 rounded-[3px] px-3 font-stamp text-xs font-medium uppercase tracking-[0.14em] text-paper-muted transition-colors hover:bg-black/20 hover:text-paper"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Shelf</span>
            <span className="sr-only sm:hidden">Back to shelf</span>
          </Link>
          <h1 className="foil line-clamp-2 min-w-0 flex-1 text-center text-sm font-medium leading-snug !tracking-[0.08em] sm:line-clamp-1 sm:text-base sm:!tracking-[0.16em]">
            {bookDetails.book_name}
          </h1>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              onClick={() => setFocus(true)}
              className="foil-line h-11 w-11 border-transparent sm:w-auto sm:border-foil/40 sm:px-4"
              aria-label="Focus mode"
            >
              <Maximize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Focus</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="foil-line h-11 w-11 border-transparent disabled:opacity-60 sm:w-auto sm:border-foil/40 sm:px-4"
              aria-label="Download chapter PDF"
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </header>
      )}

      <div
        className="relative h-1.5 shrink-0 bg-black/30"
        role="progressbar"
        aria-label="Chapter read"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={scrollPercent}
      >
        <div className="headband h-full opacity-25" aria-hidden />
        <div
          className="headband absolute inset-y-0 left-0 transition-[width] duration-100 ease-out"
          style={{ width: `${scrollPercent}%` }}
          aria-hidden
        />
      </div>

      {downloadError && !isFocus && (
        <p className="shrink-0 bg-black/30 px-4 py-2 text-center font-stamp text-sm text-error" role="alert">
          {downloadError}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {!isFocus && (
          <nav
            aria-label="Contents"
            className="shrink-0 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] md:w-72 md:[mask-image:none] md:overflow-y-auto md:overflow-x-visible md:px-3 md:py-8 lg:w-80 [&::-webkit-scrollbar]:hidden"
          >
            <h2 className="stamp-label hidden px-3 pb-4 md:block">Contents</h2>
            <ol className="flex gap-1 px-2 py-2 md:flex-col md:px-0 md:py-0">
              {chapters.map((chapter, index) => {
                const active = currentChapter === index;
                return (
                  <li key={chapter} className="shrink-0">
                    <button
                      ref={active ? scrollChipIntoView : undefined}
                      onClick={() => selectChapter(index)}
                      aria-current={active ? 'true' : undefined}
                      className={`relative flex min-h-11 max-w-[70vw] items-baseline gap-3 rounded-[3px] py-2.5 pl-8 pr-3 text-left font-stamp text-sm transition-colors md:w-full md:max-w-none ${
                        active ? 'text-foil' : 'text-paper-muted hover:bg-black/20 hover:text-paper'
                      }`}
                    >
                      {active && (
                        <span className="absolute left-2 top-0 h-7 w-3.5">
                          <Ribbon />
                        </span>
                      )}
                      <span className="shrink-0 tabular-nums text-xs opacity-70">{index + 1}</span>
                      <span className="truncate md:whitespace-normal md:leading-snug">{chapter}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <main
          ref={readerRef}
          onScroll={(event) => {
            updateScrollPercent(event.currentTarget);
            saveReaderScroll(event.currentTarget);
            showPercentBriefly();
          }}
          className="page-ground relative min-h-0 flex-1 overflow-y-auto overscroll-contain md:rounded-tl-[6px] md:shadow-[inset_0_1px_0_rgb(255_255_255/0.04),-12px_0_24px_-18px_rgb(0_0_0/0.8)]"
        >
          <span
            className={`pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-20 rounded-[3px] bg-black/60 px-2.5 py-1.5 font-stamp text-sm font-medium tabular-nums text-foil shadow-[0_6px_14px_-8px_rgb(0_0_0/0.8)] transition-opacity duration-300 ${
              percentVisible ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden
          >
            {scrollPercent}%
          </span>
          {isFocus && (
            <button
              onClick={() => setFocus(false)}
              className="foil-line fixed right-3 top-4 z-20 h-11 bg-black/50 px-3 hover:bg-black/60"
              aria-label="Leave focus mode"
            >
              <Minimize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Leave focus</span>
            </button>
          )}
          <article key={chapterName} className="page-in mx-auto max-w-[66ch] px-5 pb-16 pt-8 sm:px-8 sm:pt-12 md:pt-16">
            <h2 className="font-read text-[1.75rem] font-semibold leading-tight text-paper [text-wrap:balance] sm:text-4xl">
              {chapterName}
            </h2>
            <div className="mt-8">
              <FormattedChapter title={chapterName} text={bookDetails.data[chapterName]} />
            </div>

            <nav aria-label="Chapter" className="mt-16 flex flex-col gap-3 border-t border-foil/20 pt-8 sm:flex-row">
              {prev !== null && (
                <button
                  onClick={() => selectChapter(prev)}
                  className="flex min-h-14 flex-1 items-center gap-3 rounded-[3px] px-4 py-3 text-left transition-colors hover:bg-black/25"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0 text-foil" />
                  <span className="min-w-0">
                    <span className="stamp-label block text-[11px]">Previous</span>
                    <span className="block truncate font-stamp text-sm text-paper">{chapters[prev]}</span>
                  </span>
                </button>
              )}
              {next !== null ? (
                <button
                  onClick={() => selectChapter(next)}
                  className="flex min-h-14 flex-1 items-center justify-end gap-3 rounded-[3px] bg-black/25 px-4 py-3 text-right transition-colors hover:bg-black/40"
                >
                  <span className="min-w-0">
                    <span className="stamp-label block text-[11px]">Next chapter</span>
                    <span className="block truncate font-stamp text-sm text-paper">{chapters[next]}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-foil" />
                </button>
              ) : (
                <Link
                  to="/"
                  onClick={() => saveReaderScroll()}
                  className="flex min-h-14 flex-1 items-center justify-end gap-3 rounded-[3px] bg-black/25 px-4 py-3 text-right transition-colors hover:bg-black/40"
                >
                  <span>
                    <span className="stamp-label block text-[11px]">Finished</span>
                    <span className="block font-stamp text-sm text-paper">Back to the shelf</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-foil" />
                </Link>
              )}
            </nav>
          </article>
        </main>
      </div>
    </div>
  );
};

export default Summary;
