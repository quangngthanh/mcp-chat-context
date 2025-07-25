#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

class ChatContextMCPClient {
  private server: Server;
  private serverUrl: string;

  constructor() {
    this.server = new Server(
      {
        name: 'chat-context',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    this.serverUrl = process.env.CHAT_CONTEXT_SERVER_URL || 'http://localhost:3001';
    this.setupHandlers();
  }

  private async checkServerHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.serverUrl}/health`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'save_chat_session',
            description: 'Lưu session chat hiện tại lên server với phân tích nội dung tự động',
            inputSchema: {
              type: 'object',
              properties: {
                chatContent: {
                  type: 'string',
                  description: 'Nội dung chat đầy đủ cần lưu trữ'
                },
                title: {
                  type: 'string',
                  description: 'Tiêu đề tùy chọn cho session (sẽ tự tạo nếu không có)'
                },
                projectContext: {
                  type: 'string',
                  description: 'Context dự án hiện tại (path, tên project, etc.)'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tags để phân loại session'
                }
              },
              required: ['chatContent']
            }
          },
          {
            name: 'search_chats',
            description: 'Tìm kiếm chat sessions theo nhiều tiêu chí khác nhau (từ khóa, project, recent, etc.)',
            inputSchema: {
              type: 'object',
              properties: {
                mode: {
                  type: 'string',
                  enum: ['search', 'project', 'recent', 'similar'],
                  description: 'Chế độ tìm kiếm: search (từ khóa), project (theo dự án), recent (gần đây), similar (nội dung tương tự)',
                  default: 'search'
                },
                query: {
                  type: 'string',
                  description: 'Từ khóa tìm kiếm (dùng cho mode search/similar)'
                },
                projectContext: {
                  type: 'string',
                  description: 'Tên project để lọc (dùng cho mode project)'
                },
                content: {
                  type: 'string',
                  description: 'Nội dung để tìm sessions tương tự (dùng cho mode similar)'
                },
                agentType: {
                  type: 'string',
                  enum: ['claude', 'cursor', 'other'],
                  description: 'Lọc theo loại agent'
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 30,
                  default: 10,
                  description: 'Số lượng kết quả tối đa'
                }
              }
            }
          },
          {
            name: 'get_session_details',
            description: 'Lấy thông tin chi tiết của một session cụ thể',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'ID của session cần lấy thông tin'
                }
              },
              required: ['sessionId']
            }
          },
          {
            name: 'delete_session',
            description: 'Xóa một session cụ thể hoặc dọn dẹp dữ liệu cũ',
            inputSchema: {
              type: 'object',
              properties: {
                mode: {
                  type: 'string',
                  enum: ['single', 'cleanup'],
                  description: 'Chế độ xóa: single (xóa 1 session), cleanup (dọn dẹp sessions cũ)',
                  default: 'single'
                },
                sessionId: {
                  type: 'string',
                  description: 'ID session cần xóa (dùng cho mode single)'
                },
                olderThanDays: {
                  type: 'number',
                  minimum: 1,
                  default: 30,
                  description: 'Xóa sessions cũ hơn X ngày (dùng cho mode cleanup)'
                },
                projectContext: {
                  type: 'string',
                  description: 'Chỉ xóa sessions của project cụ thể'
                },
                agentType: {
                  type: 'string',
                  enum: ['claude', 'cursor', 'other'],
                  description: 'Chỉ xóa sessions của agent cụ thể'
                }
              }
            }
          },
          {
            name: 'get_chat_analytics',
            description: 'Lấy thống kê tổng quan về chat sessions',
            inputSchema: {
              type: 'object',
              properties: {
                random_string: {
                  type: 'string',
                  description: 'Dummy parameter for no-parameter tools'
                }
              },
              required: ['random_string']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        // Check server health before making requests
        const isServerHealthy = await this.checkServerHealth();
        if (!isServerHealthy) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ **Chat Context Server không khả dụng**\n\nServer có thể chưa được khởi động hoặc không thể kết nối.\nVui lòng kiểm tra server tại: ' + this.serverUrl
              }
            ]
          };
        }
        switch (name) {
          case 'save_chat_session':
            return await this.saveChatSession(args);
          case 'search_chats':
            return await this.searchChats(args);
          case 'get_session_details':
            return await this.getSessionDetails(args);
          case 'delete_session':
            return await this.deleteSession(args);
          case 'get_chat_analytics':
            return await this.getChatAnalytics();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `❌ **Lỗi khi thực hiện ${name}:**\n\n${errorMessage}`
            }
          ]
        };
      }
    });
  }

  private async saveChatSession(args: any) {
    const requestData = {
      ...args,
      agentId: 'chat-context-client', // Assuming a default agent ID for this client
      agentType: 'other', // Assuming a default agent type
      participants: ['chat-context-client', 'user'] // Assuming a default participant
    };

    try {
      const response = await axios.post(
        `${this.serverUrl}/api/sessions`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Id': 'chat-context-client',
            'X-Agent-Type': 'other'
          },
          timeout: 30000 // Use a default timeout
        }
      );

      const data = response.data;
      return {
        content: [{
          type: 'text',
          text: `✅ **Đã lưu session thành công!**

**Session ID:** ${data.sessionId}
**Tiêu đề:** ${data.title}
**Tóm tắt:** ${data.summary}
**Chủ đề chính:** ${data.keyTopics?.join(', ') || 'Không có'}
**Thời gian:** ${data.createdAt}

Session này đã được lưu trữ và có thể tìm kiếm được trong tương lai.`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `❌ **Lỗi khi lưu session:**\n\n${errorMessage}`
        }],
        isError: true
      };
    }
  }

  private async searchChats(args: any) {
    const mode = args.mode || 'search';
    let response: any;
    let resultData: any;

    try {
      console.error('[DEBUG] searchChats called with:', { mode, args, serverUrl: this.serverUrl });
      
      switch (mode) {
        case 'search': {
          const params = new URLSearchParams();
          if (args.query) params.append('query', args.query);
          if (args.projectContext) params.append('projectContext', args.projectContext);
          if (args.agentType) params.append('agentType', args.agentType);
          if (args.limit) params.append('limit', args.limit.toString());

          const url = `${this.serverUrl}/api/sessions/search?${params.toString()}`;
          console.error('[DEBUG] Making request to:', url);

          response = await axios.get(url, {
            headers: {
              'X-Agent-Id': 'chat-context-client',
              'X-Agent-Type': 'other'
            },
            timeout: 30000
          })
            .then(res => {
              console.error('[DEBUG] Request successful:', res.status, res.data);
              return res;
            })
            .catch(err => {
              console.error('[DEBUG] Request failed:', err.response?.status, err.response?.data, err.message);
              throw err;
            });
          resultData = response.data;
          break;
        }

        case 'project': {
          const params = new URLSearchParams();
          if (args.projectContext) params.append('projectContext', args.projectContext);
          if (args.agentType) params.append('agentType', args.agentType);
          if (args.limit) params.append('limit', args.limit.toString());

          response = await axios.get(
            `${this.serverUrl}/api/sessions/search?${params.toString()}`,
            {
              headers: {
                'X-Agent-Id': 'chat-context-client',
                'X-Agent-Type': 'other'
              },
              timeout: 30000
            }
          );
          resultData = response.data;
          break;
        }

        case 'recent': {
          const params = new URLSearchParams();
          if (args.agentType) params.append('agentType', args.agentType);
          if (args.limit) params.append('limit', args.limit.toString());

          response = await axios.get(
            `${this.serverUrl}/api/sessions/recent?${params.toString()}`,
            {
              headers: {
                'X-Agent-Id': 'chat-context-client',
                'X-Agent-Type': 'other'
              },
              timeout: 30000
            }
          );
          resultData = { results: response.data, count: response.data.length };
          break;
        }

        case 'similar': {
          response = await axios.post(
            `${this.serverUrl}/api/sessions/find-similar`,
            {
              content: args.content,
              limit: args.limit || 5
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Agent-Id': 'chat-context-client',
                'X-Agent-Type': 'other'
              },
              timeout: 30000
            }
          );
          // Transform similar API response to match search format
          const { similarSessions, basedOn, count } = response.data;
          resultData = { results: similarSessions, count, basedOn };
          break;
        }

        default:
          throw new Error(`Unknown search mode: ${mode}`);
      }

      // Format response based on mode
      return this.formatSearchResponse(mode, resultData, args);
    } catch (error) {
      throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private formatSearchResponse(mode: string, data: any, args: any) {
    const { results, count, basedOn } = data;

    if (count === 0 || !results || results.length === 0) {
      const modeMessages = {
        search: `🔍 **Không tìm thấy session nào phù hợp**\n\nTừ khóa: "${args.query}"`,
        project: `📂 **Không có lịch sử cho project này**\n\nProject: "${args.projectContext}"`,
        recent: `📝 **Chưa có session nào gần đây**\n\nChưa có dữ liệu hoặc chưa có session nào được lưu.`,
        similar: `🔍 **Không tìm thấy nội dung tương tự**\n\nKhông có session tương tự với nội dung được cung cấp.`
      };

      return {
        content: [{
          type: 'text',
          text: modeMessages[mode as keyof typeof modeMessages] || 'Không tìm thấy kết quả nào.'
        }]
      };
    }

    const sessions = results.map((session: any, index: number) => {
      const date = new Date(session.created_at).toLocaleString();
      const title = session.title || 'Untitled';
      const summary = session.context_summary || 'Không có tóm tắt';
      const topics = session.key_topics?.join(', ') || 'N/A';
      const project = session.project_context || 'N/A';
      
      return `**${index + 1}. ${title}**
ID: ${session.id}
${date} - ${session.agent_type}
${mode === 'project' || mode === 'recent' ? `Project: ${project}` : ''}
${summary}
Chủ đề: ${topics}
${session.matched_content ? `Khớp: ${session.matched_content}` : ''}`;
    }).join('\n\n---\n\n');

    const modeHeaders = {
      search: `🔍 **Tìm thấy ${count} session phù hợp:**`,
      project: `📂 **Lịch sử project "${args.projectContext}"** (${count} sessions):`,
      recent: `📝 **${count} session gần đây:**`,
      similar: `🔍 **Tìm thấy ${count} session tương tự:**${basedOn ? `\n**Dựa trên:** ${basedOn.join(', ')}` : ''}`
    };

    return {
      content: [{
        type: 'text',
        text: `${modeHeaders[mode as keyof typeof modeHeaders]}

${sessions}

💡 **Gợi ý:** Dùng \`get_session_details\` với ID để xem chi tiết session.`
      }]
    };
  }

  private async getSessionDetails(args: any) {
    try {
      const response = await axios.get(
        `${this.serverUrl}/api/sessions/${args.sessionId}`,
        {
          headers: {
            'X-Agent-Id': 'chat-context-client',
            'X-Agent-Type': 'other'
          },
          timeout: 30000
        }
      );

      const session = response.data;

      return {
        content: [{
          type: 'text',
          text: `📋 **Chi tiết Session: ${session.title}**

**ID:** ${session.id}
**Agent:** ${session.agent_type} (${session.agent_id})
**Thời gian tạo:** ${new Date(session.created_at).toLocaleString()}
**Cập nhật:** ${new Date(session.updated_at).toLocaleString()}
**Project:** ${session.project_context || 'N/A'}
**Người tham gia:** ${session.participants?.join(', ') || 'N/A'}

**Tóm tắt:**
${session.context_summary}

**Chủ đề chính:**
${session.key_topics?.join(', ') || 'N/A'}

**Quyết định/Kết luận:**
${session.decisions_made?.length > 0 ? session.decisions_made.join('\n- ') : 'Không có'}

**Code snippets:** ${session.code_snippets?.length || 0} đoạn code
**Tags:** ${session.tags?.join(', ') || 'Không có'}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `❌ **Lỗi khi lấy chi tiết session:**\n\n${errorMessage}`
        }],
        isError: true
      };
    }
  }

  private async deleteSession(args: any) {
    const mode = args.mode || 'single';
    
    try {
      if (mode === 'single') {
        if (!args.sessionId) {
          throw new Error('Session ID is required for single delete mode');
        }

        const response = await axios.delete(
          `${this.serverUrl}/api/sessions/${args.sessionId}`,
          {
            headers: {
              'X-Agent-Id': 'chat-context-client',
              'X-Agent-Type': 'other'
            },
            timeout: 30000
          }
        );

        return {
          content: [{
            type: 'text',
            text: `✅ **Đã xóa session thành công!**

**Session ID:** ${args.sessionId}
Session đã được xóa khỏi hệ thống.`
          }]
        };

      } else if (mode === 'cleanup') {
        const requestData: any = {
          olderThanDays: args.olderThanDays || 30
        };
        
        if (args.agentType) requestData.agentType = args.agentType;
        if (args.projectContext) requestData.projectContext = args.projectContext;

        const response = await axios.post(
          `${this.serverUrl}/api/sessions/cleanup`,
          requestData,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Agent-Id': 'chat-context-client',
              'X-Agent-Type': 'other'
            },
            timeout: 30000
          }
        );

        const { deletedCount, message } = response.data;

        return {
          content: [{
            type: 'text',
            text: `🧹 **Dọn dẹp dữ liệu hoàn tất!**

**Đã xóa:** ${deletedCount} sessions
**Tiêu chí:** Sessions cũ hơn ${args.olderThanDays || 30} ngày
${args.agentType ? `**Agent:** ${args.agentType}` : ''}
${args.projectContext ? `**Project:** ${args.projectContext}` : ''}

${message || 'Hệ thống đã được làm sạch.'}`
          }]
        };

      } else {
        throw new Error(`Unknown delete mode: ${mode}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `❌ **Lỗi khi xóa session:**\n\n${errorMessage}`
        }],
        isError: true
      };
    }
  }

  private async getChatAnalytics() {
    try {
      const response = await axios.get(
        `${this.serverUrl}/api/analytics/stats`,
        {
          headers: {
            'X-Agent-Id': 'chat-context-client',
            'X-Agent-Type': 'other'
          },
          timeout: 30000
        }
      );

      const stats = response.data;

      const agentStatsText = Object.entries(stats.sessions_by_agent)
        .map(([agent, count]) => `- ${agent}: ${count} sessions`)
        .join('\n');

      const projectStatsText = Object.entries(stats.sessions_by_project)
        .slice(0, 5)
        .map(([project, count]) => `- ${project}: ${count} sessions`)
        .join('\n');

      const topTopicsText = stats.most_common_topics
        .slice(0, 10)
        .map(({ topic, count }: any) => `- ${topic}: ${count}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `📊 **Thống kê Chat Context System**

**Tổng số sessions:** ${stats.total_sessions}

**Sessions theo Agent:**
${agentStatsText}

**Top 5 Projects (theo số sessions):**
${projectStatsText || 'Chưa có data'}

**Top 10 Chủ đề thường gặp:**
${topTopicsText || 'Chưa có data'}

**Hoạt động gần đây:** ${stats.recent_activity?.length || 0} ngày có hoạt động`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: `❌ **Lỗi khi lấy thống kê:**\n\n${errorMessage}`
        }],
        isError: true
      };
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Chat Context MCP Client started');
  }
}

// Start the server
const client = new ChatContextMCPClient();
client.run().catch(console.error); 