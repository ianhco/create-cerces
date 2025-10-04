import * as fs from 'fs';
import * as path from 'path';
import spawn from 'cross-spawn';
import prompts from 'prompts';
import degit from 'degit';
import chalk from 'chalk';

const templates = {
    bun: {
        key: 'bun',
        description: 'Ultra-Fast Node.js runtime with bundling and TypeScript. High performance and low overhead.',
        requiresBun: true,
        hasDevServer: true,
        sedFiles: [],
        runScripts: [],
    },
    'cf-workers': {
        key: 'cf-workers',
        description: 'Edge serverless with automatic scaling, low latency, and integration with Cloudflare services.',
        requiresBun: false,
        hasDevServer: true,
        sedFiles: ['wrangler.jsonc'],
        runScripts: ['cf-typegen'],
    },
    'aws-lambda': {
        key: 'aws-lambda',
        description: 'Traditional pay-per-use serverless computing, enables integration with the AWS ecosystem.',
        requiresBun: false,
        hasDevServer: false,
        sedFiles: [],
        runScripts: [],
    },
    docker: {
        key: 'docker',
        description: 'Containerize Cerces for deployment on major cloud platforms (e.g. AWS, Azure, Google Cloud, etc.).',
        requiresBun: true,
        hasDevServer: true,
        sedFiles: [],
        runScripts: [],
    },
};

async function main() {
    const onCancel = () => {
        console.log(chalk.bold(chalk.red('\n⤬ Operation cancelled.')));
        process.exit(1);
    };

    try {
        // Step 1: Ask for project directory
        const { projectDir } = await prompts({
            type: 'text',
            name: 'projectDir',
            message: 'Enter the directory for the new project (use "." for current directory):',
            initial: '.',
        }, { onCancel });

        const resolvedDir = path.resolve(projectDir);

        // Check if directory exists and is empty
        if (fs.existsSync(resolvedDir)) {
            const files = fs.readdirSync(resolvedDir);
            if (files.length > 0) {
                console.error(chalk.bold(chalk.red(`⤬ Error: Directory \`${projectDir}\` is not empty.`)));
                process.exit(1);
            }
        } else {
            fs.mkdirSync(resolvedDir, { recursive: true });
        }

        // Step 2: Select template
        const templateChoices = Object.values(templates).map((t) => ({
            title: t.key,
            description: t.description,
            value: t.key,
        }));

        const { selectedTemplate }: { selectedTemplate: keyof typeof templates } = await prompts({
            type: 'select',
            name: 'selectedTemplate',
            message: 'Select a template:',
            choices: templateChoices,
        }, { onCancel });

        const templateMeta = templates[selectedTemplate];

        // Step 3: Clone template
        console.log(chalk.bold(chalk.yellow(`⥕ Cloning template \`${selectedTemplate}\` into \`${projectDir}\`...`)));
        const emitter = degit(`ianhco/cerces/templates/${selectedTemplate}`, { cache: false, force: true, verbose: true });
        await emitter.clone(resolvedDir);
        console.log(chalk.bold(chalk.green(`√ Template \`${selectedTemplate}\` cloned successfully.`)));

        for (const sedFile of templateMeta.sedFiles) {
            const filePath = path.join(resolvedDir, sedFile);
            if (fs.existsSync(filePath)) {
                let content = fs.readFileSync(filePath, 'utf-8');
                content = content.replace(/%%DIR_NAME%%/g, path.basename(resolvedDir));
                fs.writeFileSync(filePath, content, 'utf-8');
            }
        }

        // Step 4: Ask to auto-install dependencies
        const { autoInstall } = await prompts({
            type: 'confirm',
            name: 'autoInstall',
            message: 'Do you want to automatically install dependencies?',
            initial: true,
        }, { onCancel });

        if (autoInstall) {
            // Check if Bun is required and installed
            if (templateMeta.requiresBun) {
                const hasBun = commandExists('bun');
                if (!hasBun) {
                    const { installBun } = await prompts({
                        type: 'confirm',
                        name: 'installBun',
                        message: 'Bun is not installed but required for this template. Install Bun globally using npm?',
                        initial: true,
                    }, { onCancel });
                    if (installBun) {
                        console.log(chalk.bold(chalk.cyan(`⥕ Installing Bun globally...`)));
                        spawn.sync('npm', ['install', '-g', 'bun'], { stdio: 'inherit' });
                        console.log(chalk.bold(chalk.green(`√ Bun installed successfully.`)));
                    } else {
                        console.log(chalk.bold(chalk.yellow(`! Skipping Bun installation. You may need to install it manually.`)));
                    }
                }
            }

            // Detect package manager
            const packageManager = detectPackageManager();

            if (packageManager) {
                console.log(chalk.bold(chalk.cyan(`∷ Installing dependencies using ${packageManager}...`)));
                process.chdir(resolvedDir); // Change to project dir for install
                if (packageManager === 'bun') {
                    spawn.sync('bun', ['install'], { stdio: 'inherit' });
                } else if (packageManager === 'pnpm') {
                    spawn.sync('pnpm', ['install', '--config.auto-install-peers=true'], { stdio: 'inherit' });
                } else if (packageManager === 'npm') {
                    spawn.sync('npm', ['install'], { stdio: 'inherit' });
                }
                console.log(chalk.bold(chalk.green(`√ Dependencies installed successfully.`)));
            } else {
                console.log(chalk.bold(chalk.yellow(`! Unsupported package manager detected (e.g., yarn).`)));
                console.log(chalk.bold(chalk.yellow(`! Please install dependencies manually, including peer dependencies of cerces.`)));
            }

            for (const script of templateMeta.runScripts) {
                if (packageManager) {
                    console.log(chalk.bold(chalk.cyan(`∷ Running post-install script \`${script}\` using ${packageManager}...`)));
                    spawn.sync(packageManager, ['run', script], { stdio: 'inherit' });
                }
            }

            if (templateMeta.hasDevServer) {
                console.log();
                console.log(chalk.bold(`√ Run \`${chalk.cyan(`${packageManager} run dev`)}\` to start the development server.`));
            } else {
                console.log();
                console.log(chalk.bold(chalk.yellow(`! This template does not include a development server.`)));
                console.log(chalk.bold(chalk.yellow(`! Additional setup may be required specific to the \`${selectedTemplate}\` runtime.`)));
            }
        }
        console.log(chalk.bold(chalk.green(`√ Project created successfully in "${projectDir}".`)));
    } catch (error: any) {
        console.error(chalk.gray(error.stack));
        console.error(chalk.bold(chalk.red(`⤬ Error: ${error.message}`)));
        process.exit(1);
    }
}

function commandExists(cmd: string): boolean {
    const result = spawn.sync(cmd, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
}

function detectPackageManager(): 'bun' | 'pnpm' | 'npm' | null {
    if (commandExists('bun')) return 'bun';
    if (commandExists('pnpm')) return 'pnpm';
    if (commandExists('npm')) return 'npm';
    return null; // For yarn or others
}

main();