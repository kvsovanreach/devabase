use crate::Config;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkConfig {
    pub strategy: ChunkStrategy,
    pub chunk_size: usize,
    pub chunk_overlap: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChunkStrategy {
    Fixed,
    Sentence,
    Paragraph,
    Markdown,
}

impl Default for ChunkStrategy {
    fn default() -> Self {
        Self::Markdown
    }
}

impl From<&str> for ChunkStrategy {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "fixed" => ChunkStrategy::Fixed,
            "sentence" => ChunkStrategy::Sentence,
            "paragraph" => ChunkStrategy::Paragraph,
            "markdown" => ChunkStrategy::Markdown,
            _ => ChunkStrategy::Markdown,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TextChunk {
    pub content: String,
    pub index: usize,
    pub start_offset: usize,
    pub end_offset: usize,
    pub metadata: Option<serde_json::Value>,
}

pub struct Chunker {
    config: ChunkConfig,
}

impl Chunker {
    pub fn new(config: &Config) -> Self {
        Self {
            config: ChunkConfig {
                strategy: ChunkStrategy::from(config.chunking.default_strategy.as_str()),
                chunk_size: config.chunking.chunk_size,
                chunk_overlap: config.chunking.chunk_overlap,
            },
        }
    }

    pub fn with_config(config: ChunkConfig) -> Self {
        Self { config }
    }

    pub fn chunk(&self, text: &str) -> Vec<TextChunk> {
        match self.config.strategy {
            ChunkStrategy::Fixed => self.chunk_fixed(text),
            ChunkStrategy::Sentence => self.chunk_sentence(text),
            ChunkStrategy::Paragraph => self.chunk_paragraph(text),
            ChunkStrategy::Markdown => self.chunk_markdown(text),
        }
    }

    fn chunk_fixed(&self, text: &str) -> Vec<TextChunk> {
        let mut chunks = Vec::new();
        let chars: Vec<char> = text.chars().collect();
        let mut start = 0;
        let mut index = 0;

        while start < chars.len() {
            let end = (start + self.config.chunk_size).min(chars.len());
            let content: String = chars[start..end].iter().collect();

            chunks.push(TextChunk {
                content,
                index,
                start_offset: start,
                end_offset: end,
                metadata: None,
            });

            // Move start with overlap
            start = if end == chars.len() {
                end
            } else {
                start + self.config.chunk_size - self.config.chunk_overlap
            };
            index += 1;
        }

        chunks
    }

    fn chunk_sentence(&self, text: &str) -> Vec<TextChunk> {
        let sentences: Vec<&str> = text
            .split(|c| c == '.' || c == '!' || c == '?')
            .filter(|s| !s.trim().is_empty())
            .collect();

        let mut chunks = Vec::new();
        let mut current_chunk = String::new();
        let mut current_start = 0;
        let mut index = 0;

        for sentence in sentences {
            let sentence = sentence.trim().to_string() + ".";

            if current_chunk.len() + sentence.len() > self.config.chunk_size && !current_chunk.is_empty() {
                chunks.push(TextChunk {
                    content: current_chunk.clone(),
                    index,
                    start_offset: current_start,
                    end_offset: current_start + current_chunk.len(),
                    metadata: None,
                });
                index += 1;

                // Keep overlap
                let overlap_start = current_chunk.len().saturating_sub(self.config.chunk_overlap);
                current_start = current_start + overlap_start;
                current_chunk = current_chunk[overlap_start..].to_string();
            }

            if !current_chunk.is_empty() {
                current_chunk.push(' ');
            }
            current_chunk.push_str(&sentence);
        }

        if !current_chunk.is_empty() {
            chunks.push(TextChunk {
                content: current_chunk.clone(),
                index,
                start_offset: current_start,
                end_offset: current_start + current_chunk.len(),
                metadata: None,
            });
        }

        chunks
    }

    fn chunk_paragraph(&self, text: &str) -> Vec<TextChunk> {
        let paragraphs: Vec<&str> = text
            .split("\n\n")
            .filter(|s| !s.trim().is_empty())
            .collect();

        let mut chunks = Vec::new();
        let mut current_chunk = String::new();
        let mut current_start = 0;
        let mut index = 0;

        for paragraph in paragraphs {
            let paragraph = paragraph.trim();

            if current_chunk.len() + paragraph.len() > self.config.chunk_size && !current_chunk.is_empty() {
                chunks.push(TextChunk {
                    content: current_chunk.clone(),
                    index,
                    start_offset: current_start,
                    end_offset: current_start + current_chunk.len(),
                    metadata: None,
                });
                index += 1;
                current_start = current_start + current_chunk.len();
                current_chunk.clear();
            }

            if !current_chunk.is_empty() {
                current_chunk.push_str("\n\n");
            }
            current_chunk.push_str(paragraph);
        }

        if !current_chunk.is_empty() {
            chunks.push(TextChunk {
                content: current_chunk.clone(),
                index,
                start_offset: current_start,
                end_offset: current_start + current_chunk.len(),
                metadata: None,
            });
        }

        chunks
    }

    fn chunk_markdown(&self, text: &str) -> Vec<TextChunk> {
        let mut chunks = Vec::new();
        let mut current_chunk = String::new();
        let mut current_header = String::new();
        let mut current_start = 0;
        let mut index = 0;

        for line in text.lines() {
            // Check if this is a header
            if line.starts_with('#') {
                // If we have content, save the current chunk
                if !current_chunk.is_empty() {
                    chunks.push(TextChunk {
                        content: current_chunk.clone(),
                        index,
                        start_offset: current_start,
                        end_offset: current_start + current_chunk.len(),
                        metadata: Some(serde_json::json!({
                            "header": current_header
                        })),
                    });
                    index += 1;
                    current_start = current_start + current_chunk.len();
                    current_chunk.clear();
                }
                current_header = line.to_string();
            }

            // Check if adding this line would exceed chunk size
            if current_chunk.len() + line.len() > self.config.chunk_size && !current_chunk.is_empty() {
                chunks.push(TextChunk {
                    content: current_chunk.clone(),
                    index,
                    start_offset: current_start,
                    end_offset: current_start + current_chunk.len(),
                    metadata: Some(serde_json::json!({
                        "header": current_header
                    })),
                });
                index += 1;
                current_start = current_start + current_chunk.len();
                current_chunk.clear();

                // Preserve header context
                if !current_header.is_empty() {
                    current_chunk = current_header.clone() + "\n";
                }
            }

            if !current_chunk.is_empty() && !current_chunk.ends_with('\n') {
                current_chunk.push('\n');
            }
            current_chunk.push_str(line);
        }

        if !current_chunk.is_empty() {
            chunks.push(TextChunk {
                content: current_chunk.clone(),
                index,
                start_offset: current_start,
                end_offset: current_start + current_chunk.len(),
                metadata: Some(serde_json::json!({
                    "header": current_header
                })),
            });
        }

        chunks
    }
}
