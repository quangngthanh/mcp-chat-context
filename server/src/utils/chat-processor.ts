import crypto from 'crypto';
import { Logger } from './logger';

export interface ProcessedChatContent {
  summary: string;
  keyTopics: string[];
  decisions: string[];
  codeSnippets: Array<{
    language: string;
    content: string;
    context?: string;
  }>;
  generatedTitle: string;
  contentHash: string;
  wordCount: number;
  participantCount: number;
}

export class ChatContentProcessor {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ChatContentProcessor');
  }

  async processContent(chatContent: string): Promise<ProcessedChatContent> {
    try {
      // Calculate content hash for deduplication
      const contentHash = this.generateContentHash(chatContent);
      
      // Extract basic metrics
      const wordCount = this.countWords(chatContent);
      const participantCount = this.extractParticipantCount(chatContent);
      
      // Extract code snippets
      const codeSnippets = this.extractCodeSnippets(chatContent);
      
      // Extract key topics using simple keyword extraction
      const keyTopics = this.extractKeyTopics(chatContent);
      
      // Extract decisions/conclusions
      const decisions = this.extractDecisions(chatContent);
      
      // Generate summary
      const summary = this.generateSummary(chatContent, keyTopics, decisions);
      
      // Generate title
      const generatedTitle = this.generateTitle(keyTopics, codeSnippets);

      const result: ProcessedChatContent = {
        summary,
        keyTopics,
        decisions,
        codeSnippets,
        generatedTitle,
        contentHash,
        wordCount,
        participantCount
      };

      this.logger.debug('Processed chat content', {
        wordCount,
        topicsCount: keyTopics.length,
        decisionsCount: decisions.length,
        codeSnippetsCount: codeSnippets.length
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to process chat content:', error);
      throw error;
    }
  }

  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private countWords(content: string): number {
    return content.trim().split(/\s+/).length;
  }

  private extractParticipantCount(content: string): number {
    // Simple heuristic: count unique patterns like "User:", "Assistant:", "Claude:", etc.
    const participantPattern = /^(User|Assistant|Claude|Human|AI|Bot|\w+):/gm;
    const matches = content.match(participantPattern);
    if (!matches) return 1;
    
    const uniqueParticipants = new Set(matches.map(match => match.replace(':', '')));
    return uniqueParticipants.size;
  }

  private extractCodeSnippets(content: string): Array<{ language: string; content: string; context?: string }> {
    const codeSnippets: Array<{ language: string; content: string; context?: string }> = [];
    
    // Extract markdown code blocks
    const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockPattern.exec(content)) !== null) {
      const language = match[1] || 'plain';
      const codeContent = match[2].trim();
      
      if (codeContent.length > 10) { // Only include substantial code snippets
        // Try to find context (text before the code block)
        const beforeCode = content.substring(Math.max(0, match.index - 200), match.index);
        const contextMatch = beforeCode.match(/([^.\n!?]*[.\n!?]\s*)$/);
        const context = contextMatch ? contextMatch[1].trim() : undefined;
        
        codeSnippets.push({
          language,
          content: codeContent,
          context
        });
      }
    }

    // Extract inline code
    const inlineCodePattern = /`([^`\n]{10,})`/g;
    while ((match = inlineCodePattern.exec(content)) !== null) {
      const codeContent = match[1];
      if (codeContent.includes('(') || codeContent.includes('{') || codeContent.includes('=')) {
        // Likely code, not just a word
        codeSnippets.push({
          language: 'inline',
          content: codeContent
        });
      }
    }

    return codeSnippets;
  }

  private extractKeyTopics(content: string): string[] {
    const topics = new Set<string>();
    
    // Programming languages and technologies
    const techKeywords = [
      'javascript', 'typescript', 'python', 'java', 'c\\+\\+', 'c#', 'go', 'rust', 'php',
      'react', 'vue', 'angular', 'node', 'express', 'django', 'flask', 'spring',
      'sql', 'mongodb', 'postgresql', 'mysql', 'redis', 'docker', 'kubernetes',
      'aws', 'azure', 'gcp', 'git', 'github', 'api', 'rest', 'graphql',
      'html', 'css', 'json', 'xml', 'yaml', 'cli', 'bash', 'shell'
    ];
    
    // Development concepts
    const conceptKeywords = [
      'authentication', 'authorization', 'database', 'deployment', 'testing',
      'debugging', 'optimization', 'performance', 'security', 'error handling',
      'logging', 'monitoring', 'caching', 'validation', 'migration',
      'refactoring', 'configuration', 'environment', 'build', 'ci/cd'
    ];
    
    // Combine all keywords
    const allKeywords = [...techKeywords, ...conceptKeywords];
    
    for (const keyword of allKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      if (regex.test(content)) {
        topics.add(keyword.toLowerCase());
      }
    }
    
    // Extract quoted terms (likely important concepts)
    const quotedTerms = content.match(/"([^"]{3,30})"/g);
    if (quotedTerms) {
      quotedTerms.forEach(term => {
        const cleanTerm = term.replace(/"/g, '').toLowerCase();
        if (cleanTerm.length > 2 && cleanTerm.length < 30) {
          topics.add(cleanTerm);
        }
      });
    }
    
    // Extract file extensions and technical terms
    const fileExtensions = content.match(/\.\w{2,4}\b/g);
    if (fileExtensions) {
      fileExtensions.forEach(ext => {
        topics.add(ext.toLowerCase());
      });
    }

    return Array.from(topics).slice(0, 20); // Limit to 20 topics
  }

  private extractDecisions(content: string): string[] {
    const decisions: string[] = [];
    
    // Decision indicators
    const decisionPatterns = [
      /(?:decided|concluded|agreed|determined|resolved|chose)\s+(?:to|that)\s+([^.!?]+[.!?])/gi,
      /(?:solution|approach|strategy|plan):\s*([^.\n]+)/gi,
      /(?:we should|let's|I'll|we'll)\s+([^.!?\n]+[.!?]?)/gi,
      /(?:final|ultimate|best)\s+(?:decision|choice|solution):\s*([^.\n]+)/gi
    ];
    
    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const decision = match[1].trim();
        if (decision.length > 10 && decision.length < 200) {
          decisions.push(decision);
        }
      }
    }
    
    return decisions.slice(0, 10); // Limit to 10 decisions
  }

  private generateSummary(content: string, keyTopics: string[], decisions: string[]): string {
    // Simple summary generation
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    if (sentences.length === 0) {
      return 'Chat conversation with technical discussion.';
    }
    
    // Try to find the most informative sentences
    const importantSentences = sentences.filter(sentence => {
      const lowerSentence = sentence.toLowerCase();
      return keyTopics.some(topic => lowerSentence.includes(topic)) ||
             lowerSentence.includes('problem') ||
             lowerSentence.includes('solution') ||
             lowerSentence.includes('issue') ||
             lowerSentence.includes('error') ||
             lowerSentence.includes('implement') ||
             lowerSentence.includes('create') ||
             lowerSentence.includes('build');
    });
    
    const summarySource = importantSentences.length > 0 ? importantSentences : sentences;
    const selectedSentences = summarySource.slice(0, 3);
    
    let summary = selectedSentences.join('. ').trim();
    
    // Add key topics if they weren't mentioned
    if (keyTopics.length > 0) {
      const topicString = keyTopics.slice(0, 5).join(', ');
      summary += ` Topics discussed: ${topicString}.`;
    }
    
    // Limit summary length
    if (summary.length > 500) {
      summary = summary.substring(0, 497) + '...';
    }
    
    return summary;
  }

  private generateTitle(keyTopics: string[], codeSnippets: Array<{ language: string; content: string }>): string {
    if (keyTopics.length === 0 && codeSnippets.length === 0) {
      return 'Chat Session - ' + new Date().toISOString().split('T')[0];
    }
    
    // Prioritize programming languages and frameworks
    const primaryTopics = keyTopics.filter(topic => 
      ['javascript', 'typescript', 'python', 'react', 'node', 'express', 'database', 'api'].includes(topic)
    );
    
    // Use code language if available
    const languages = [...new Set(codeSnippets.map(snippet => snippet.language))];
    
    let titleParts: string[] = [];
    
    if (languages.length > 0 && languages[0] !== 'plain' && languages[0] !== 'inline') {
      titleParts.push(languages[0].toUpperCase());
    }
    
    if (primaryTopics.length > 0) {
      titleParts.push(...primaryTopics.slice(0, 2).map(topic => 
        topic.charAt(0).toUpperCase() + topic.slice(1)
      ));
    } else if (keyTopics.length > 0) {
      titleParts.push(...keyTopics.slice(0, 2).map(topic => 
        topic.charAt(0).toUpperCase() + topic.slice(1)
      ));
    }
    
    if (titleParts.length === 0) {
      titleParts.push('Development');
    }
    
    const title = titleParts.join(' + ') + ' Discussion';
    
    return title.length > 50 ? title.substring(0, 47) + '...' : title;
  }
} 