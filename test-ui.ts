#!/usr/bin/env node

/**
 * Simple agent UI to test the Gong MCP Server
 *
 * This script creates an interactive CLI that connects to the MCP server
 * and allows you to test all available tools.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as readline from "readline/promises";
import { spawn } from "child_process";

// ANSI color codes for better output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

class GongMCPTestUI {
  private client: Client;
  private rl: readline.Interface;
  private availableTools: any[] = [];

  constructor() {
    this.client = new Client(
      {
        name: "gong-test-ui",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async connect() {
    console.log(`${colors.cyan}Connecting to Gong MCP Server...${colors.reset}`);

    // Check for required environment variables
    if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_ACCESS_KEY_SECRET) {
      console.error(`${colors.red}Error: GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET environment variables are required${colors.reset}`);
      console.log(`\nPlease set them in your .env file or export them:\n`);
      console.log(`  export GONG_ACCESS_KEY=your_key`);
      console.log(`  export GONG_ACCESS_KEY_SECRET=your_secret\n`);
      process.exit(1);
    }

    const transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      env: {
        ...process.env,
      },
    });

    await this.client.connect(transport);
    console.log(`${colors.green}✓ Connected to Gong MCP Server${colors.reset}\n`);

    // List available tools
    const toolsList = await this.client.listTools();
    this.availableTools = toolsList.tools;

    console.log(`${colors.bright}Available Tools:${colors.reset}`);
    this.availableTools.forEach((tool, index) => {
      console.log(`  ${colors.yellow}${index + 1}.${colors.reset} ${colors.bright}${tool.name}${colors.reset}`);
      console.log(`     ${tool.description}`);
    });
    console.log("");
  }

  async showMenu() {
    console.log(`${colors.cyan}╔═══════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}   ${colors.bright}Gong MCP Server Test UI${colors.reset}              ${colors.cyan}║${colors.reset}`);
    console.log(`${colors.cyan}╚═══════════════════════════════════════════════╝${colors.reset}\n`);

    console.log(`${colors.bright}Quick Tests:${colors.reset}`);
    console.log(`  ${colors.green}1${colors.reset}. List recent calls`);
    console.log(`  ${colors.green}2${colors.reset}. List users`);
    console.log(`  ${colors.green}3${colors.reset}. List deals`);
    console.log(`  ${colors.green}4${colors.reset}. List emails`);
    console.log(`  ${colors.green}5${colors.reset}. List library folders`);
    console.log(`  ${colors.green}6${colors.reset}. Get call details (requires call ID)`);
    console.log(`  ${colors.green}7${colors.reset}. Get transcript (requires call ID)`);
    console.log(`  ${colors.green}8${colors.reset}. Get user stats (requires date range)`);
    console.log(`  ${colors.green}9${colors.reset}. Get calls for CRM account (requires account ID)`);
    console.log(`\n  ${colors.yellow}c${colors.reset}. Custom tool call`);
    console.log(`  ${colors.red}q${colors.reset}. Quit\n`);
  }

  async executeTool(toolName: string, args: any) {
    console.log(`\n${colors.cyan}Executing: ${colors.bright}${toolName}${colors.reset}`);
    console.log(`${colors.cyan}Arguments: ${colors.reset}${JSON.stringify(args, null, 2)}\n`);

    try {
      const startTime = Date.now();
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });
      const duration = Date.now() - startTime;

      console.log(`${colors.green}✓ Success${colors.reset} ${colors.cyan}(${duration}ms)${colors.reset}\n`);
      console.log(`${colors.bright}Response:${colors.reset}`);

      // Parse and pretty-print the response
      if (result.content && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === "text") {
          try {
            const parsed = JSON.parse(content.text);
            console.log(JSON.stringify(parsed, null, 2));
          } catch {
            console.log(content.text);
          }
        }
      }
    } catch (error) {
      console.log(`${colors.red}✗ Error:${colors.reset} ${error}\n`);
    }
  }

  async handleQuickTest(choice: string) {
    switch (choice) {
      case "1":
        await this.executeTool("gong_list_calls", {});
        break;

      case "2":
        await this.executeTool("gong_list_users", {});
        break;

      case "3":
        await this.executeTool("gong_list_deals", {});
        break;

      case "4":
        await this.executeTool("gong_list_emails", {});
        break;

      case "5":
        await this.executeTool("gong_list_library_folders", {});
        break;

      case "6": {
        const callId = await this.rl.question(`${colors.yellow}Enter call ID: ${colors.reset}`);
        if (callId.trim()) {
          await this.executeTool("gong_get_call_details", { call_ids: [callId.trim()] });
        }
        break;
      }

      case "7": {
        const callId = await this.rl.question(`${colors.yellow}Enter call ID: ${colors.reset}`);
        if (callId.trim()) {
          await this.executeTool("gong_get_transcript", { call_id: callId.trim() });
        }
        break;
      }

      case "8": {
        const fromDate = await this.rl.question(`${colors.yellow}From date (YYYY-MM-DD): ${colors.reset}`);
        const toDate = await this.rl.question(`${colors.yellow}To date (YYYY-MM-DD): ${colors.reset}`);
        if (fromDate.trim() && toDate.trim()) {
          await this.executeTool("gong_get_user_stats", {
            from_date: fromDate.trim(),
            to_date: toDate.trim(),
          });
        }
        break;
      }

      case "9": {
        const objectType = await this.rl.question(`${colors.yellow}Object type (Account/Deal/Lead/Contact): ${colors.reset}`);
        const objectId = await this.rl.question(`${colors.yellow}Object ID: ${colors.reset}`);
        if (objectType.trim() && objectId.trim()) {
          await this.executeTool("gong_get_calls_for_account", {
            object_type: objectType.trim(),
            object_ids: [objectId.trim()],
          });
        }
        break;
      }

      case "c": {
        console.log(`\n${colors.bright}Available tools:${colors.reset}`);
        this.availableTools.forEach((tool, index) => {
          console.log(`  ${index + 1}. ${tool.name}`);
        });
        const toolChoice = await this.rl.question(`\n${colors.yellow}Select tool number: ${colors.reset}`);
        const toolIndex = parseInt(toolChoice) - 1;

        if (toolIndex >= 0 && toolIndex < this.availableTools.length) {
          const tool = this.availableTools[toolIndex];
          console.log(`\n${colors.bright}${tool.name}${colors.reset}`);
          console.log(`${tool.description}\n`);
          console.log(`${colors.cyan}Input schema:${colors.reset}`);
          console.log(JSON.stringify(tool.inputSchema, null, 2));

          const argsJson = await this.rl.question(`\n${colors.yellow}Enter arguments as JSON: ${colors.reset}`);
          try {
            const args = JSON.parse(argsJson);
            await this.executeTool(tool.name, args);
          } catch (error) {
            console.log(`${colors.red}Invalid JSON${colors.reset}`);
          }
        }
        break;
      }
    }
  }

  async run() {
    await this.connect();

    while (true) {
      await this.showMenu();
      const choice = await this.rl.question(`${colors.bright}Select an option: ${colors.reset}`);

      if (choice.toLowerCase() === "q") {
        console.log(`\n${colors.cyan}Goodbye!${colors.reset}`);
        await this.cleanup();
        process.exit(0);
      }

      await this.handleQuickTest(choice.toLowerCase());

      console.log(`\n${colors.cyan}${"─".repeat(50)}${colors.reset}\n`);
      await this.rl.question(`${colors.yellow}Press Enter to continue...${colors.reset}`);
      console.clear();
    }
  }

  async cleanup() {
    try {
      await this.client.close();
    } catch (error) {
      // Ignore cleanup errors
    }
    this.rl.close();
  }
}

// Main execution
const ui = new GongMCPTestUI();

process.on("SIGINT", async () => {
  console.log(`\n\n${colors.cyan}Shutting down...${colors.reset}`);
  await ui.cleanup();
  process.exit(0);
});

ui.run().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
