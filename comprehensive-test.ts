#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Gong MCP Server
 *
 * This script runs a full battery of tests including:
 * - Listing calls from the last 2 months
 * - Searching transcripts for specific mentions (e.g., "New Relic")
 * - Testing all available tools
 * - Generating a detailed test report
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "fs";

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  data?: any;
  error?: string;
}

class GongMCPTester {
  private client: Client;
  private results: TestResult[] = [];

  constructor() {
    this.client = new Client(
      {
        name: "gong-comprehensive-test",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
  }

  async connect() {
    console.log("🔌 Connecting to Gong MCP Server...\n");

    if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_ACCESS_KEY_SECRET) {
      throw new Error("GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET must be set");
    }

    const transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      env: {
        ...process.env,
      },
    });

    await this.client.connect(transport);
    console.log("✅ Connected successfully\n");
  }

  async runTest(name: string, fn: () => Promise<any>): Promise<TestResult> {
    console.log(`🧪 Running: ${name}`);
    const startTime = Date.now();

    try {
      const data = await fn();
      const duration = Date.now() - startTime;
      console.log(`   ✅ Passed (${duration}ms)\n`);

      const result: TestResult = { name, success: true, duration, data };
      this.results.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`   ❌ Failed (${duration}ms): ${error}\n`);

      const result: TestResult = {
        name,
        success: false,
        duration,
        error: String(error)
      };
      this.results.push(result);
      return result;
    }
  }

  async callTool(toolName: string, args: any): Promise<any> {
    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    });

    if (result.content && result.content.length > 0) {
      const content = result.content[0];
      if (content.type === "text") {
        try {
          return JSON.parse(content.text);
        } catch {
          return content.text;
        }
      }
    }
    return result;
  }

  // Calculate date range for last 2 months
  getDateRange() {
    const now = new Date();
    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setMonth(now.getMonth() - 2);

    return {
      from: twoMonthsAgo.toISOString(),
      to: now.toISOString(),
      fromDate: twoMonthsAgo.toISOString().split('T')[0],
      toDate: now.toISOString().split('T')[0],
    };
  }

  async runAllTests() {
    console.log("=" .repeat(60));
    console.log("GONG MCP SERVER - COMPREHENSIVE TEST SUITE");
    console.log("=" .repeat(60));
    console.log();

    const dateRange = this.getDateRange();
    console.log(`📅 Test Date Range: ${dateRange.fromDate} to ${dateRange.toDate}\n`);

    // Test 1: List available tools
    await this.runTest("List available tools", async () => {
      const tools = await this.client.listTools();
      console.log(`   Found ${tools.tools.length} tools:`);
      tools.tools.forEach(tool => {
        console.log(`   - ${tool.name}`);
      });
      return tools;
    });

    // Test 2: List calls from last 2 months
    const callsResult = await this.runTest("List calls from last 2 months", async () => {
      const calls = await this.callTool("gong_list_calls", {
        from_date: dateRange.from,
        to_date: dateRange.to,
      });
      console.log(`   Found ${calls.calls?.length || 0} calls`);
      if (calls.calls && calls.calls.length > 0) {
        console.log(`   First call: "${calls.calls[0].title}" on ${calls.calls[0].date}`);
      }
      return calls;
    });

    const calls = callsResult.data?.calls || [];

    // Test 3: Get details for first few calls
    if (calls.length > 0) {
      const callIdsToTest = calls.slice(0, Math.min(3, calls.length)).map((c: any) => c.id);

      await this.runTest(`Get details for ${callIdsToTest.length} calls`, async () => {
        const details = await this.callTool("gong_get_call_details", {
          call_ids: callIdsToTest,
        });
        console.log(`   Retrieved details for ${details.length} calls`);
        return details;
      });

      // Test 4: Get transcripts and search for "New Relic"
      console.log("\n🔍 SEARCHING FOR 'NEW RELIC' MENTIONS IN TRANSCRIPTS\n");

      const transcriptResults: any[] = [];
      let newRelicMentions = 0;

      for (let i = 0; i < Math.min(5, calls.length); i++) {
        const call = calls[i];

        await this.runTest(`Get transcript for call: "${call.title}"`, async () => {
          try {
            const transcript = await this.callTool("gong_get_transcript", {
              call_id: call.id,
            });

            const fullText = transcript.transcript_formatted || "";
            const hasNewRelic = /new\s*relic/i.test(fullText);

            if (hasNewRelic) {
              newRelicMentions++;
              console.log(`   🎯 FOUND "New Relic" mention!`);

              // Extract context around the mention
              const lines = fullText.split('\n');
              const mentionLines = lines.filter((line: string) => /new\s*relic/i.test(line));
              mentionLines.slice(0, 2).forEach((line: string) => {
                console.log(`   📝 "${line.substring(0, 100)}..."`);
              });
            } else {
              console.log(`   No "New Relic" mentions found`);
            }

            transcriptResults.push({
              call_id: call.id,
              title: call.title,
              has_new_relic: hasNewRelic,
              transcript_length: fullText.length,
            });

            return transcript;
          } catch (error) {
            console.log(`   ⚠️  Transcript not available for this call`);
            throw error;
          }
        });
      }

      console.log(`\n📊 New Relic Search Results: ${newRelicMentions} mentions found in ${transcriptResults.length} calls analyzed\n`);
    }

    // Test 5: List users
    await this.runTest("List users", async () => {
      const users = await this.callTool("gong_list_users", {});
      console.log(`   Found ${users.users?.length || 0} users`);
      if (users.users && users.users.length > 0) {
        console.log(`   Example user: ${users.users[0].name} (${users.users[0].email})`);
      }
      return users;
    });

    // Test 6: Get user stats
    await this.runTest("Get user statistics", async () => {
      const stats = await this.callTool("gong_get_user_stats", {
        from_date: dateRange.fromDate,
        to_date: dateRange.toDate,
      });
      console.log(`   Retrieved stats for ${stats.user_stats?.length || 0} users`);
      return stats;
    });

    // Test 7: List deals
    await this.runTest("List deals", async () => {
      const deals = await this.callTool("gong_list_deals", {
        from_date: dateRange.from,
        to_date: dateRange.to,
      });
      console.log(`   Found ${deals.deals?.length || 0} deals`);
      if (deals.deals && deals.deals.length > 0) {
        console.log(`   Example deal: "${deals.deals[0].title}" - ${deals.deals[0].stage}`);
      }
      return deals;
    });

    // Test 8: List emails
    await this.runTest("List emails", async () => {
      const emails = await this.callTool("gong_list_emails", {
        from_date: dateRange.from,
        to_date: dateRange.to,
      });
      console.log(`   Found ${emails.emails?.length || 0} emails`);
      if (emails.emails && emails.emails.length > 0) {
        console.log(`   Example email: "${emails.emails[0].subject}"`);
      }
      return emails;
    });

    // Test 9: List library folders
    await this.runTest("List library folders", async () => {
      const folders = await this.callTool("gong_list_library_folders", {});
      console.log(`   Found ${folders.folders?.length || 0} library folders`);
      return folders;
    });

    // Test 10: Get calls for CRM account (if we have deals)
    const dealsResult = this.results.find(r => r.name === "List deals");
    if (dealsResult?.success && dealsResult.data?.deals?.length > 0) {
      const firstDeal = dealsResult.data.deals[0];

      await this.runTest("Get calls for CRM account", async () => {
        const accountCalls = await this.callTool("gong_get_calls_for_account", {
          object_type: "Deal",
          object_ids: [firstDeal.id],
          from_date: dateRange.from,
          to_date: dateRange.to,
        });
        console.log(`   Found ${accountCalls.crm_objects?.[0]?.call_count || 0} calls for deal: "${firstDeal.title}"`);
        return accountCalls;
      });
    }

    this.printSummary();
  }

  printSummary() {
    console.log("\n");
    console.log("=" .repeat(60));
    console.log("TEST SUMMARY");
    console.log("=" .repeat(60));

    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Total time: ${totalTime}ms`);
    console.log(`📊 Success rate: ${((passed / this.results.length) * 100).toFixed(1)}%\n`);

    if (failed > 0) {
      console.log("Failed tests:");
      this.results.filter(r => !r.success).forEach(r => {
        console.log(`  ❌ ${r.name}: ${r.error}`);
      });
      console.log();
    }

    // Save detailed results to file
    const reportPath = "test-results.json";
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`📄 Detailed results saved to: ${reportPath}\n`);
  }

  async cleanup() {
    try {
      await this.client.close();
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Main execution
async function main() {
  const tester = new GongMCPTester();

  try {
    await tester.connect();
    await tester.runAllTests();
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  } finally {
    await tester.cleanup();
  }
}

process.on("SIGINT", async () => {
  console.log("\n\n🛑 Test interrupted by user");
  process.exit(0);
});

main();
