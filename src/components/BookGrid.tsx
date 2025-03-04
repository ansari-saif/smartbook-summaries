import { motion } from "framer-motion";
import { Book } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export interface Book {
  id: string;
  title: string;
  chapters: string[];
  file: File;
  bookName: string;
  startPage: number;
  endPage: number;
}

interface BookGridProps {
  books: Book[];
  onBookSelect: (book: Book) => void;
  onBookRemove: (id: string) => void;
}

export const BookGrid = ({ books, onBookSelect, onBookRemove }: BookGridProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {books.map((book) => (
        <motion.div
          key={book.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Book className="h-8 w-8 text-primary" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onBookRemove(book.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/20"
              >
                Remove
              </Button>
            </div>
            <h3 className="text-lg font-semibold text-primary-contrast truncate">
              {book.title}
            </h3>
            <p className="text-sm text-gray-400">
              {book.chapters.length} chapters
            </p>
            <Button
              className="w-full button-gradient"
              onClick={() => onBookSelect(book)}
            >
              Generate Summary
            </Button>
          </Card>
        </motion.div>
      ))}
    </div>
  );
};
