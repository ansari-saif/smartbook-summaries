import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, ArrowLeft, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '@/api';

interface BookDetails {
  book_name: string;
  data: Record<string, string>;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="text-primary-contrast font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

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
        <ol key={`ol-${blocks.length}`} className="list-decimal space-y-2 pl-5 text-gray-300 leading-7">
          {inlineNumbered.map((item, index) => (
            <li key={index}>{renderInline(item.replace(/^\d+\.\s+/, ''))}</li>
          ))}
        </ol>
      );
    } else {
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-gray-300 leading-7">
          {renderInline(joined)}
        </p>
      );
    }
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-2 pl-5 text-gray-300 leading-7">
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
      <ol key={`ol-${blocks.length}`} className="list-decimal space-y-2 pl-5 text-gray-300 leading-7">
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
        <h3 key={`h-${blocks.length}`} className="pt-4 text-lg font-semibold text-primary-contrast">
          Summary
        </h3>
      );
      return;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushAll();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="pt-2 text-lg font-semibold text-primary-contrast">
          {heading[1]}
        </h3>
      );
      return;
    }
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      flushAll();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="pt-2 text-lg font-semibold text-primary-contrast">
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

  return <div className="space-y-4">{blocks}</div>;
}

const LoadingScreen = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="text-center space-y-6 p-8 max-w-md">
      <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-primary-contrast">
          Please wait a moment...
        </h3>
        <p className="text-gray-400">
          This might take some time. Why not grab a ☕️ while we prepare your book summary?
        </p>
      </div>
    </div>
  </div>
);

function scrollStorageKey(book: string, chapter: string) {
  return `smartbook-scroll:${book}::${chapter}`;
}

function detailsStorageKey(book: string) {
  return `smartbook-details:${book}`;
}

function fullscreenStorageKey(book: string) {
  return `smartbook-fs:${book}`;
}

function chapterStorageKey(book: string) {
  return `smartbook-chapter:${book}`;
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

function readStoredChapter(book: string | null, chapterCount = Infinity) {
  if (!book) return 0;
  const n = Number(sessionStorage.getItem(chapterStorageKey(book)) ?? '0');
  if (!Number.isFinite(n) || n < 0) return 0;
  if (Number.isFinite(chapterCount) && n >= chapterCount) return 0;
  return n;
}

const Summary = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookName = searchParams.get('book');

  const cachedDetails = loadCachedDetails(bookName);
  const [bookDetails, setBookDetails] = useState<BookDetails | null>(cachedDetails);
  const [isLoading, setIsLoading] = useState(!cachedDetails);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    () => !!bookName && sessionStorage.getItem(fullscreenStorageKey(bookName)) === '1'
  );
  const [currentChapter, setCurrentChapter] = useState(() => readStoredChapter(bookName));
  const [scrollPercent, setScrollPercent] = useState(0);
  const [scrollIndicatorVisible, setScrollIndicatorVisible] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const readerShellRef = useRef<HTMLDivElement>(null);
  const scrollHideTimerRef = useRef<number | null>(null);
  const prevChapterRef = useRef(currentChapter);
  const bookDetailsRef = useRef(bookDetails);
  const currentChapterRef = useRef(currentChapter);
  const isFullscreenRef = useRef(isFullscreen);
  bookDetailsRef.current = bookDetails;
  currentChapterRef.current = currentChapter;
  isFullscreenRef.current = isFullscreen;

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(
    () => (typeof document !== 'undefined' && isFullscreen ? document.body : null)
  );

  const setInlineSlot = (node: HTMLDivElement | null) => {
    if (isFullscreenRef.current) return;
    setPortalTarget(node);
  };

  const clearScrollHideTimer = () => {
    if (scrollHideTimerRef.current !== null) {
      window.clearTimeout(scrollHideTimerRef.current);
      scrollHideTimerRef.current = null;
    }
  };

  const showScrollIndicatorBriefly = () => {
    setScrollIndicatorVisible(true);
    clearScrollHideTimer();
    scrollHideTimerRef.current = window.setTimeout(() => {
      setScrollIndicatorVisible(false);
      scrollHideTimerRef.current = null;
    }, 3000);
  };

  const updateScrollPercent = (el: HTMLDivElement) => {
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) {
      setScrollPercent(100);
      return;
    }
    setScrollPercent(Math.min(100, Math.max(0, Math.round((el.scrollTop / max) * 100))));
  };

  const saveReaderScroll = (el?: HTMLDivElement | null) => {
    const node = el ?? readerRef.current;
    const details = bookDetailsRef.current;
    if (!node || !details) return;
    const chapter = Object.keys(details.data)[currentChapterRef.current];
    if (!chapter) return;
    sessionStorage.setItem(
      scrollStorageKey(details.book_name, chapter),
      String(Math.round(node.scrollTop))
    );
  };

  const restoreReaderScroll = () => {
    const details = bookDetailsRef.current;
    const el = readerRef.current;
    if (!el || !details) return;
    const chapter = Object.keys(details.data)[currentChapterRef.current];
    if (!chapter) return;
    const raw = sessionStorage.getItem(scrollStorageKey(details.book_name, chapter));
    const top = raw == null ? 0 : Number(raw);
    const apply = () => {
      if (!readerRef.current) return;
      readerRef.current.scrollTop = Number.isFinite(top) ? top : 0;
      updateScrollPercent(readerRef.current);
    };
    requestAnimationFrame(() => requestAnimationFrame(apply));
  };

  const handleReaderScroll = (event: React.UIEvent<HTMLDivElement>) => {
    updateScrollPercent(event.currentTarget);
    saveReaderScroll(event.currentTarget);
    showScrollIndicatorBriefly();
  };

  const handleChapterSelect = (index: number) => {
    saveReaderScroll();
    setCurrentChapter(index);
  };

  const toggleFullscreen = () => {
    saveReaderScroll();
    setIsFullscreen((value) => {
      const next = !value;
      if (bookName) {
        sessionStorage.setItem(fullscreenStorageKey(bookName), next ? '1' : '0');
      }
      return next;
    });
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
    sessionStorage.setItem(fullscreenStorageKey(bookName), isFullscreen ? '1' : '0');
  }, [bookName, isFullscreen]);

  useEffect(() => {
    if (!bookName) return;
    sessionStorage.setItem(chapterStorageKey(bookName), String(currentChapter));
  }, [bookName, currentChapter]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isFullscreen) return;
      saveReaderScroll();
      setIsFullscreen(false);
      if (bookName) sessionStorage.setItem(fullscreenStorageKey(bookName), '0');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bookName, isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFullscreen]);

  // Keep one portal host: inline slot normally, document.body in fullscreen.
  useEffect(() => {
    if (isFullscreen) {
      setPortalTarget(document.body);
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!bookDetails) return;
    if (prevChapterRef.current !== currentChapter) {
      prevChapterRef.current = currentChapter;
      setScrollIndicatorVisible(false);
      clearScrollHideTimer();
    }
    restoreReaderScroll();
  }, [currentChapter, bookDetails, isFullscreen, portalTarget]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveReaderScroll();
        return;
      }
      if (bookName) {
        setIsFullscreen(sessionStorage.getItem(fullscreenStorageKey(bookName)) === '1');
      }
      restoreReaderScroll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [bookName]);

  useEffect(() => () => clearScrollHideTimer(), []);

  const handleDownloadPDF = async () => {
    if (!bookDetails) return;
    const chapters = Object.keys(bookDetails.data);
    const currentChapterName = chapters[currentChapter];
    setIsDownloading(true);
    try {
      const response = await fetch(
        api(`/chapter-pdf?book_name=${encodeURIComponent(bookDetails.book_name)}&chapter_name=${encodeURIComponent(currentChapterName)}`),
        { method: 'GET' }
      );

      if (!response.ok) throw new Error('PDF download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bookDetails.book_name}-${currentChapterName}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading PDF:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading && !bookDetails) {
    return <LoadingScreen />;
  }

  if (!bookDetails) return null;

  const chapters = Object.keys(bookDetails.data);
  const reader = (
    <div
      ref={readerShellRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-[100] flex h-screen flex-col bg-background'
          : 'relative max-h-[70vh]'
      }
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 h-1 bg-white/10 transition-opacity duration-300 ${
          scrollIndicatorVisible ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
      >
        <div
          className="h-full bg-primary transition-[width] duration-75 ease-out"
          style={{ width: `${scrollPercent}%` }}
        />
      </div>

      <div
        className={`pointer-events-none absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2 transition-opacity duration-300 ${
          scrollIndicatorVisible ? 'opacity-100' : 'opacity-0'
        }`}
        aria-live="polite"
        aria-label={`Reading progress ${scrollPercent} percent`}
      >
        <div className="relative h-28 w-1.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="absolute inset-x-0 top-0 rounded-full bg-primary transition-[height] duration-75 ease-out"
            style={{ height: `${scrollPercent}%` }}
          />
        </div>
        <span className="rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-primary-contrast shadow-sm ring-1 ring-white/10">
          {scrollPercent}%
        </span>
      </div>

      <div
        ref={readerRef}
        onScroll={handleReaderScroll}
        className={`h-full overflow-y-auto bg-background ${
          isFullscreen
            ? 'max-h-none p-8 md:p-12'
            : 'max-h-[70vh] rounded-lg border border-white/10 bg-background-light p-6'
        }`}
      >
        {isFullscreen && (
          <div className="mb-8 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-primary-contrast">
              {chapters[currentChapter]}
            </h2>
            <Button variant="outline" onClick={toggleFullscreen}>
              <Minimize2 className="mr-2 h-4 w-4" />
              Exit full screen
            </Button>
          </div>
        )}
        <FormattedChapter
          title={chapters[currentChapter]}
          text={bookDetails.data[chapters[currentChapter]]}
        />
      </div>
    </div>
  );

  return (
    <>
    <div className="min-h-screen bg-background p-6 animate-in">
      <div className="max-w-4xl mx-auto space-y-8">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <Button variant="ghost" className="mb-4" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Books
          </Button>
          <h1 className="text-4xl font-bold text-primary-contrast">
            {bookDetails.book_name}
          </h1>
          <p className="text-lg text-gray-400">
            AI-Generated Summary
          </p>
        </motion.header>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass-panel p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-primary-contrast">
                  {chapters[currentChapter]}
                </h2>
                <p className="text-sm text-gray-400">
                  Summary generated by AI
                </p>
              </div>
              <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={toggleFullscreen}
              >
                <Maximize2 className="mr-2 h-4 w-4" />
                Full screen
              </Button>
              <Button 
                className="button-gradient" 
                onClick={handleDownloadPDF}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isDownloading ? 'Downloading...' : 'Download PDF'}
              </Button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-6">
              <motion.div
                className="col-span-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <nav className="space-y-2">
                  {chapters.map((chapter, index) => (
                    <motion.button
                      key={index}
                      onClick={() => handleChapterSelect(index)}
                      className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                        currentChapter === index
                          ? 'bg-primary text-white'
                          : 'hover:bg-primary/20 text-gray-400'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {chapter}
                    </motion.button>
                  ))}
                </nav>
              </motion.div>

              <div
                ref={setInlineSlot}
                className={`col-span-9 ${isFullscreen ? 'min-h-[70vh]' : ''}`}
              />
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
    {portalTarget && createPortal(reader, portalTarget)}
    </>
  );
};

export default Summary;
