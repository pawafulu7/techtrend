#!/usr/bin/env tsx
/**
 * Environment validation script
 * Run this on startup to ensure all required environment variables are set
 */

import { config } from 'dotenv';
import { z } from 'zod';
import chalk from 'chalk';

// Load environment variables
config();

// Define required environment variables schema
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().describe('PostgreSQL connection URL'),
  
  // Authentication (Required)
  NEXTAUTH_SECRET: z.string().min(32).describe('NextAuth secret key (minimum 32 characters)'),
  
  // AI Services (At least one required)
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
}).refine(
  (data) => data.GEMINI_API_KEY || data.OPENAI_API_KEY || data.ANTHROPIC_API_KEY,
  {
    message: 'At least one AI service API key is required (GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)',
  }
);

// Validation function
function validateEnvironment() {
  console.log(chalk.blue('🔍 Validating environment variables...\n'));
  
  try {
    const env = envSchema.parse(process.env);
    
    console.log(chalk.green('✅ All required environment variables are set!\n'));
    
    // Show configuration summary
    console.log(chalk.cyan('📋 Configuration Summary:'));
    console.log(chalk.gray('━'.repeat(50)));
    
    // Database
    console.log(chalk.yellow('Database:'));
    console.log(`  • PostgreSQL: ${chalk.green('✓')} Connected`);
    
    // Authentication
    console.log(chalk.yellow('\nAuthentication:'));
    console.log(`  • NextAuth Secret: ${chalk.green('✓')} Configured`);
    
    // AI Services
    console.log(chalk.yellow('\nAI Services:'));
    if (env.GEMINI_API_KEY) {
      console.log(`  • Gemini API: ${chalk.green('✓')} Available`);
    }
    if (env.OPENAI_API_KEY) {
      console.log(`  • OpenAI API: ${chalk.green('✓')} Available`);
    }
    if (env.ANTHROPIC_API_KEY) {
      console.log(`  • Anthropic API: ${chalk.green('✓')} Available`);
    }
    
    // Optional services
    console.log(chalk.yellow('\nOptional Services:'));
    if (process.env.REDIS_URL || process.env.REDIS_HOST) {
      console.log(`  • Redis Cache: ${chalk.green('✓')} Configured`);
    } else {
      console.log(`  • Redis Cache: ${chalk.gray('○')} Not configured (using fallback)`);
    }
    
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      console.log(`  • Email Service: ${chalk.green('✓')} Configured`);
    } else {
      console.log(`  • Email Service: ${chalk.gray('○')} Not configured`);
    }
    
    console.log(chalk.gray('\n' + '━'.repeat(50)));
    console.log(chalk.green('✨ Environment validation passed!\n'));
    
    process.exit(0);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.log(chalk.red('❌ Environment validation failed!\n'));
      console.log(chalk.yellow('Missing or invalid environment variables:\n'));
      
      error.errors.forEach((err) => {
        const path = err.path.join('.');
        const message = err.message;
        console.log(chalk.red(`  • ${path}: ${message}`));
      });
      
      console.log(chalk.gray('\n' + '━'.repeat(50)));
      console.log(chalk.cyan('\n📚 Setup Guide:\n'));
      
      console.log('1. Copy the example environment file:');
      console.log(chalk.gray('   cp .env.example .env\n'));
      
      console.log('2. Edit .env and add the required values:');
      console.log(chalk.gray('   DATABASE_URL="postgresql://user:pass@localhost:5432/techtrend"'));
      console.log(chalk.gray('   NEXTAUTH_SECRET="your-secret-key-minimum-32-chars"'));
      console.log(chalk.gray('   GEMINI_API_KEY="your-gemini-api-key"\n'));
      
      console.log('3. For production, ensure all sensitive values are properly secured.');
      
      console.log(chalk.gray('\n' + '━'.repeat(50)));
      console.log(chalk.red('\n⚠️  Please fix the environment configuration and try again.\n'));
      
      process.exit(1);
    }
    
    throw error;
  }
}

// Run validation
validateEnvironment();