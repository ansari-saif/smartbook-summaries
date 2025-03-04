
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Upload, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const Index = () => {
  const [chapters, setChapters] = useState<string[]>(['Chapter 1']);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const navigate = useNavigate();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    }
  };

  const addChapter = () => {
    setChapters([...chapters, `Chapter ${chapters.length + 1}`]);
  };

  const removeChapter = (index: number) => {
    setChapters(chapters.filter((_, i) => i !== index));
  };

  const updateChapterName = (index: number, name: string) => {
    const newChapters = [...chapters];
    newChapters[index] = name;
    setChapters(newChapters);
  };

  const handleSubmit = () => {
    if (selectedFile && chapters.length > 0) {
      navigate('/summary');
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 animate-in">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-primary-contrast">
            Refine Your Book with AI
          </h1>
          <p className="text-lg text-gray-400">
            Keep the meaning, cut the fluff!
          </p>
        </header>

        <Card className="glass-panel p-6 space-y-6">
          <div className="space-y-4">
            <label className="block text-lg font-medium text-primary-contrast">
              Upload Your Book
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
            <div className="space-y-3">
              {chapters.map((chapter, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 animate-slideUp"
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
                    disabled={chapters.length === 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            className="w-full button-gradient"
            disabled={!selectedFile}
          >
            <span>Generate Summaries</span>
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default Index;
