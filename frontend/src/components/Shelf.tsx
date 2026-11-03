import { clothFor, clothStyle, storedChapter } from "@/lib/binding";

export interface ShelfBook {
  bookName: string;
  chapterCount: number;
}

interface ShelfProps {
  books: ShelfBook[];
  onOpen: (bookName: string) => void;
}

export function Ribbon({ chapter }: { chapter?: number }) {
  return (
    <span
      className="pointer-events-none absolute inset-0 flex items-end justify-center bg-ribbon pb-2.5 font-stamp text-xs font-semibold tabular-nums text-paper shadow-[0_4px_8px_-4px_rgb(0_0_0/0.6)]"
      style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 84%, 0 100%)" }}
      aria-hidden
    >
      {chapter != null ? chapter + 1 : null}
    </span>
  );
}

function spineHeight(bookName: string) {
  return 300 + (bookName.length * 7) % 56;
}

export const Shelf = ({ books, onOpen }: ShelfProps) => {
  return (
    <>
      {/* Phones: the books lie flat in a stack, spines facing out. */}
      <ul className="flex flex-col gap-1.5 md:hidden">
        {books.map((book, i) => {
          const cloth = clothFor(book.bookName);
          const place = storedChapter(book.bookName);
          return (
            <li key={book.bookName} style={{ paddingInline: `${(i % 3) * 6}px ${((i + 1) % 3) * 4}px` }}>
              <button
                onClick={() => onOpen(book.bookName)}
                style={clothStyle(cloth)}
                className="cloth relative flex min-h-16 w-full items-center gap-3 rounded-[2px] pl-0 pr-4 text-left shadow-[0_6px_12px_-8px_rgb(0_0_0/0.8)] transition-transform duration-200 active:translate-x-1"
                aria-label={`Open ${book.bookName}${place != null ? `, stopped in chapter ${place + 1}` : ""}`}
              >
                <span className="headband h-full w-2 self-stretch" aria-hidden />
                <span className="h-full w-px self-stretch bg-foil/50" aria-hidden />
                <span className="foil line-clamp-2 min-w-0 flex-1 py-3 text-sm font-medium leading-snug">
                  {book.bookName}
                </span>
                <span className="shrink-0 font-stamp text-xs text-paper-muted">
                  {book.chapterCount} ch.
                </span>
                {place != null && (
                  <span className="absolute -bottom-3 right-14 z-10 h-10 w-5">
                    <Ribbon chapter={place} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Larger screens: upright spines on a plank. */}
      <div className="hidden w-fit min-w-[18rem] max-w-full md:block">
        <ul className="flex flex-wrap items-end gap-x-2 gap-y-10 px-6">
          {books.map((book) => {
            const cloth = clothFor(book.bookName);
            const place = storedChapter(book.bookName);
            return (
              <li key={book.bookName} className="relative">
                <button
                  onClick={() => onOpen(book.bookName)}
                  style={{ ...clothStyle(cloth), height: spineHeight(book.bookName) }}
                  className="cloth group relative flex w-[84px] flex-col items-center rounded-t-[3px] shadow-[0_10px_18px_-10px_rgb(0_0_0/0.9)] transition-transform duration-300 ease-out-expo [@media(hover:hover)]:hover:-translate-y-2"
                  aria-label={`Open ${book.bookName}${place != null ? `, stopped in chapter ${place + 1}` : ""}`}
                >
                  <span className="headband h-2 w-full rounded-t-[3px]" aria-hidden />
                  <span className="mt-4 h-px w-10 bg-foil/60" aria-hidden />
                  <span className="mt-1 h-px w-10 bg-foil/60" aria-hidden />
                  <span
                    className="foil my-5 min-h-0 flex-1 overflow-hidden text-sm font-medium leading-tight"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {book.bookName}
                  </span>
                  <span className="mb-1 h-px w-10 bg-foil/60" aria-hidden />
                  <span className="mb-3 h-px w-10 bg-foil/60" aria-hidden />
                  <span className="mb-4 font-stamp text-[11px] text-paper-muted">
                    {book.chapterCount} ch.
                  </span>
                </button>
                {place != null && (
                  <span className="absolute -bottom-8 left-1/2 z-10 h-10 w-5 -translate-x-1/2">
                    <Ribbon chapter={place} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <div
          className="h-4 rounded-[2px] bg-library-deep shadow-[0_14px_24px_-12px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.06)]"
          aria-hidden
        />
      </div>
    </>
  );
};
