export function validateSessionData(data: any, isUpdate: boolean = false): string | null {
  if (!isUpdate) {
    // Required fields for new sessions
    if (!data.agentId || typeof data.agentId !== 'string') {
      return 'agentId is required and must be a string';
    }

    if (!data.agentType || !['claude', 'cursor', 'other'].includes(data.agentType)) {
      return 'agentType must be one of: claude, cursor, other';
    }

    if (!data.chatContent || typeof data.chatContent !== 'string') {
      return 'chatContent is required and must be a string';
    }

    if (data.chatContent.length > 50 * 1024 * 1024) { // 50MB limit - TĂNG LIMIT CHO RAW CONTENT
      return 'chatContent exceeds maximum size of 50MB';
    }
  }

  // Optional field validations
  if (data.title && (typeof data.title !== 'string' || data.title.length > 500)) {
    return 'title must be a string with maximum length of 500 characters';
  }

  if (data.projectContext && (typeof data.projectContext !== 'string' || data.projectContext.length > 1000)) {
    return 'projectContext must be a string with maximum length of 1000 characters';
  }

  if (data.tags && (!Array.isArray(data.tags) || !data.tags.every((tag: any) => typeof tag === 'string'))) {
    return 'tags must be an array of strings';
  }

  if (data.tags && data.tags.length > 50) { // TĂNG LIMIT CHO TAGS
    return 'maximum of 50 tags allowed';
  }

  return null; // No validation errors
}

export function validateSearchParams(query: any): string | null {
  if (query.limit && (isNaN(Number(query.limit)) || Number(query.limit) < 1 || Number(query.limit) > 100)) {
    return 'limit must be a number between 1 and 100';
  }

  if (query.offset && (isNaN(Number(query.offset)) || Number(query.offset) < 0)) {
    return 'offset must be a non-negative number';
  }

  if (query.agentType && !['claude', 'cursor', 'other'].includes(query.agentType)) {
    return 'agentType must be one of: claude, cursor, other';
  }

  if (query.dateFrom && !isValidISODate(query.dateFrom)) {
    return 'dateFrom must be a valid ISO date string';
  }

  if (query.dateTo && !isValidISODate(query.dateTo)) {
    return 'dateTo must be a valid ISO date string';
  }

  if (query.tags && typeof query.tags === 'string') {
    const tags = query.tags.split(',');
    if (tags.length > 20) { // TĂNG LIMIT CHO SEARCH TAGS
      return 'maximum of 20 tags allowed in search';
    }
  }

  return null; // No validation errors
}

function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && date.toISOString().startsWith(dateString.substring(0, 10));
}

export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') return '';
  
  // Remove potential script tags and other dangerous content
  const sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers

  return sanitized.substring(0, maxLength).trim();
}

export function validateId(id: string): boolean {
  return typeof id === 'string' && 
         id.length > 0 && 
         id.length <= 100 && 
         /^[a-zA-Z0-9_-]+$/.test(id);
} 