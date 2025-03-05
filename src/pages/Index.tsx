import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookGrid, Book } from '@/components/BookGrid';

interface APIBook {
  book_name: string;
  chapter_count: number;
}

const Index = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<{ chapters: string[] }>({ chapters: ['Chapter 1'] });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bookName, setBookName] = useState('');
  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetch('https://book-backend.ansarisaif.com/books')
      .then(response => response.json())
      .then(data => {
        if (data.status === 'success') {
          const apiBooks = data.books.map((apiBook: APIBook) => ({
            id: Math.random().toString(36).substr(2, 9),
            title: apiBook.book_name,
            bookName: apiBook.book_name,
            chapters: Array(apiBook.chapter_count).fill('').map((_, i) => `Chapter ${i + 1}`),
            chapter_count: apiBook.chapter_count
          }));
          setBooks(apiBooks);
        }
      })
      .catch(error => {
        console.error('Error fetching books:', error);
      });
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    }
  };

  const addChapter = () => {
    setCurrentBook(prev => ({
      ...prev,
      chapters: [...prev.chapters, `Chapter ${prev.chapters.length + 1}`]
    }));
  };

  const removeChapter = (index: number) => {
    setCurrentBook(prev => ({
      ...prev,
      chapters: prev.chapters.filter((_, i) => i !== index)
    }));
  };

  const updateChapterName = (index: number, name: string) => {
    setCurrentBook(prev => ({
      ...prev,
      chapters: prev.chapters.map((chapter, i) => (i === index ? name : chapter))
    }));
  };

  const handleAddBook = () => {
    if (selectedFile && currentBook.chapters.length > 0 && bookName && startPage && endPage) {
      const newBook: Book = {
        id: Math.random().toString(36).substr(2, 9),
        title: bookName,
        chapters: currentBook.chapters,
        file: selectedFile,
        bookName: bookName,
        startPage: parseInt(startPage),
        endPage: parseInt(endPage)
      };

      const formData = new FormData();
      formData.append('pdf_file', selectedFile);
      formData.append('search_strings', JSON.stringify(currentBook.chapters));
      formData.append('start', startPage);
      formData.append('end', endPage);
      formData.append('book_name', bookName);

      fetch('https://book-backend.ansarisaif.com/process-pdf', {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        console.log('Success:', data);
      })
      .catch((error) => {
        console.error('Error:', error);
      });

      setBooks(prev => [...prev, newBook]);
      setSelectedFile(null);
      setCurrentBook({ chapters: ['Chapter 1'] });
      setBookName('');
      setStartPage('');
      setEndPage('');
    }
  };

  const handleBookRemove = (id: string) => {
    setBooks(prev => prev.filter(book => book.id !== id));
  };

  const handleBookSelect = (book_name: string) => {
    // localStorage.setItem('selectedBook', JSON.stringify(book));
    navigate(`/summary?book=${book_name}`);
  };

  return (
    <div className="min-h-screen bg-background p-6 animate-in">
      <div className="max-w-6xl mx-auto space-y-8">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h1 className="text-4xl font-bold text-primary-contrast">
            Refine Your Books with AI
          </h1>
          <p className="text-lg text-gray-400">
            Keep the meaning, cut the fluff!
          </p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <Card className="glass-panel p-6 space-y-6">
            <div className="space-y-4">
              <label className="block text-lg font-medium text-primary-contrast">
                Upload A New Book
              </label>
              <div className="flex justify-center">
                <label className="w-full cursor-pointer">
                  <div className="border-2 border-dashed border-primary/50 rounded-lg p-8 text-center hover:border-primary transition-colors">
                    <Upload className="mx-auto h-12 w-12 text-primary mb-4" />
                    <p className="text-sm text-gray-400">
                      {selectedFile ? selectedFile.name : 'Drop your PDF here or click to upload'}
                    </p>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf"
                      onChange={handleFileChange}
                    />
                  </div>
                </label>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bookName">Book Name</Label>
                <Input
                  id="bookName"
                  value={bookName}
                  onChange={(e) => setBookName(e.target.value)}
                  placeholder="Enter book name"
                  className="bg-background-light border-white/10"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startPage">Start Page</Label>
                  <Input
                    id="startPage"
                    type="number"
                    value={startPage}
                    onChange={(e) => setStartPage(e.target.value)}
                    placeholder="Enter start page"
                    min="1"
                    className="bg-background-light border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endPage">End Page</Label>
                  <Input
                    id="endPage"
                    type="number"
                    value={endPage}
                    onChange={(e) => setEndPage(e.target.value)}
                    placeholder="Enter end page"
                    min="1"
                    className="bg-background-light border-white/10"
                  />
                </div>
              </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-lg font-medium text-primary-contrast">
                  Chapter Names
                </label>
                <Button
                  onClick={addChapter}
                  variant="outline"
                  size="icon"
                  className="rounded-full hover:bg-primary/20"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <AnimatePresence>
                {currentBook.chapters.map((chapter, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center space-x-3"
                  >
                    <input
                      type="text"
                      value={chapter}
                      onChange={(e) => updateChapterName(index, e.target.value)}
                      className="flex-1 bg-background-light rounded-lg px-4 py-2 text-primary-contrast border border-white/10 focus:border-primary outline-none"
                    />
                    <Button
                      onClick={() => removeChapter(index)}
                      variant="ghost"
                      size="icon"
                      className="hover:bg-destructive/20"
                      disabled={currentBook.chapters.length === 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            
              
            </div>

            <Button
              onClick={handleAddBook}
              className="w-full button-gradient"
              disabled={!selectedFile}
            >
              Add Book
            </Button>
          </Card>

          {books.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-2xl font-semibold text-primary-contrast mb-6">
                Your Books
              </h2>
              <BookGrid
                books={books}
                onBookSelect={handleBookSelect}
                onBookRemove={handleBookRemove}
              />
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Index;
