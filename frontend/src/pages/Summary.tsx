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

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-gray-300 leading-7">
        {renderInline(paragraph.join(' '))}
      </p>
    );
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

  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line || line === '---') {
      flushParagraph();
      flushList();
      return;
    }
    if (/^here is the text rewritten/i.test(line)) return;
    if (/^-\s+".+"\s+→/.test(line)) return;
    if (line.toLowerCase() === title.toLowerCase()) return;
    if (/^summary\s*:/i.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="pt-4 text-lg font-semibold text-primary-contrast">
          Summary
        </h3>
      );
      return;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="pt-2 text-lg font-semibold text-primary-contrast">
          {heading[1]}
        </h3>
      );
      return;
    }
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="pt-2 text-lg font-semibold text-primary-contrast">
          {line.slice(2, -2)}
        </h3>
      );
      return;
    }
    const bullet = line.match(/^[*-]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      return;
    }
    flushList();
    paragraph.push(line);
  });

  flushParagraph();
  flushList();

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

const Summary = () => {
  const [currentChapter, setCurrentChapter] = useState(0);
  const [bookDetails, setBookDetails] = useState<BookDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const isFullscreen = nativeFullscreen || expanded;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookName = searchParams.get('book');

  useEffect(() => {
    if (!bookName) {
      navigate('/');
      return;
    }

    setIsLoading(true);
    fetch(api(`/book-details?book_name=${encodeURIComponent(bookName)}`))
      .then(response => response.json())
      .then(data => {
        if (data.status === 'success') {
          setBookDetails({
            book_name: data.book_name,
            data: data.data
          });
        }
      })
      .catch(error => {
        console.error('Error fetching book details:', error);
        navigate('/');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [bookName, navigate]);

  useEffect(() => {
    const onChange = () => {
      setNativeFullscreen(document.fullscreenElement === readerRef.current);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!expanded || !readerRef.current || document.fullscreenElement === readerRef.current) return;
    readerRef.current.requestFullscreen().catch(() => {});
  }, [expanded]);

  const toggleFullscreen = async () => {
    if (expanded || document.fullscreenElement) {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      setExpanded(false);
      return;
    }
    setExpanded(true);
  };

  const handleDownloadPDF = async () => {
    const currentChapterName = chapters[currentChapter];
    setIsDownloading(true);
    try {
      const response = await fetch(
        api(`/chapter-pdf?book_name=${encodeURIComponent(bookDetails!.book_name)}&chapter_name=${encodeURIComponent(currentChapterName)}`),
        { method: 'GET' }
      );
      
      if (!response.ok) throw new Error('PDF download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bookDetails!.book_name}-${currentChapterName}.pdf`;
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

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!bookDetails) return null;

  const chapters = Object.keys(bookDetails.data);
  const reader = (
    <div
      ref={readerRef}
      className={`overflow-y-auto bg-background ${
        isFullscreen
          ? 'fixed inset-0 z-50 h-screen max-h-none p-8 md:p-12'
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
                      onClick={() => setCurrentChapter(index)}
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

              <motion.div
                className="col-span-9"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {!isFullscreen && reader}
              </motion.div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
    {isFullscreen && createPortal(reader, document.body)}
    </>
  );
};

export default Summary;
