import prompts from "prompts"
import spawn from "cross-spawn"
import whichPmRuns from "which-pm-runs"
import semver from "semver"
import fs from "node:fs"

let slugPattern = /^[a-z0-9-]+$/
let templates = [
    {
        value: "hello-world",
        title: "hello-world",
        description: "Get started with a basic Worker with Workery",
    },
    {
        value: "d1-drizzle",
        title: "d1-drizzle",
        description: "Get started with an SQL D1 Worker with Workery and Drizzle ORM",
    }
] satisfies prompts.Choice[]

type TemplateKeys = typeof templates[number]['value']

let templateUrls: { [key in TemplateKeys]: string } = {
    "hello-world": "iann838/workery/templates/hello-world",
    "d1-drizzle": "iann838/workery/templates/d1-drizzle",
}

type PmName = "pnpm" | "npm" | "yarn" | "bun"

const detectPackageManager = () => {
	const pmInfo = whichPmRuns() as { name: PmName, version: string } | undefined

	let { name, version } = pmInfo ?? { name: "npm", version: "0.0.0" }

	if (process.env.TEST_PM && process.env.TEST_PM_VERSION) {
		name = process.env.TEST_PM as PmName
		version = process.env.TEST_PM_VERSION
		process.env.npm_config_user_agent = name
	}

	switch (name) {
		case "pnpm":
			if (semver.gt(version, "6.0.0")) {
				return {
					name,
					version,
					npm: "pnpm",
					npx: "pnpm",
					dlx: ["pnpm", "dlx"],
				}
			}
			return {
				name,
				version,
				npm: "pnpm",
				npx: "pnpx",
				dlx: ["pnpx"],
			}
		case "yarn":
			if (semver.gt(version, "2.0.0")) {
				return {
					name,
					version,
					npm: "yarn",
					npx: "yarn",
					dlx: ["yarn", "dlx"],
				}
			}
			return {
				name,
				version,
				npm: "yarn",
				npx: "yarn",
				dlx: ["yarn"],
			}
		case "bun":
			return {
				name,
				version,
				npm: "bun",
				npx: "bunx",
				dlx: ["bunx"],
			}

		case "npm":
		default:
			return {
				name,
				version,
				npm: "npm",
				npx: "npx",
				dlx: ["npx"],
			}
	}
}

function onState(state: prompts.Answers<any>) {
    if (state.aborted) {
        console.log()
        console.log(redText("!"), "Operation aborted by user")
        console.log()
        process.exit(1)
    }
}

const writeFile = (path: string, content: string) => {
	try {
		fs.writeFileSync(path, content);
	} catch (error) {
		throw new Error(error as string);
	}
}

const readFile = (path: string) => {
	try {
		return fs.readFileSync(path, "utf-8");
	} catch (error) {
		throw new Error(error as string);
	}
}

const redText = (text: string) => `\x1b[31m${text}\x1b[0m`
const greenText = (text: string) => `\x1b[32m${text}\x1b[0m`
const cyanText = (text: string) => `\x1b[36m${text}\x1b[0m`
const greyText = (text: string) => `\x1b[90m${text}\x1b[0m`
const boldText = (text: string) => `\x1b[1m${text}\x1b[0m`

async function main() {
    const { directory, template }: { directory: string, template: TemplateKeys } = await prompts([
        {
            type: "select",
            name: "template",
            onState,
            message: "Select a base template for your application",
            choices: templates,
        },
        {
            type: "text",
            name: "directory",
            onState,
            message: "The directory where the application should be created",
            validate: (val): string | boolean => {
                if (!slugPattern.test(val) && val != ".")
                    return "Directory must be alphanumeric separated by hyphens (-) or current directory (.)"
                if (val != "." && fs.existsSync(val))
                    return `Directory "${val}" already exists. Please choose a different directory.`
                if (val == "." && fs.readdirSync(".").length > 0)
                    return "Current directory is not empty. Please choose a different directory or an empty directory."
                return true
            }
        },
    ])

    const { npx, version } = detectPackageManager()
    const cloudflarePkg = npx == "yarn" && semver.lt(version, "2.0.0") ? "cloudflare": "cloudflare@latest"
    
    const templateUrl = templateUrls[template]
    spawn.sync(npx, ["create", cloudflarePkg, "--template", templateUrl, "--lang", "ts", "--deploy", "false", "--git", "true", directory], {
        stdio: "inherit"
    })

    if (!fs.existsSync(directory)) {
        console.log()
        console.log(redText("!"), "Failed to create the application directory")
        console.log()
        process.exit(1)
    }

    if (template == "hello-world") {
        console.log()
        console.log("💻", boldText("Start developing"))
        console.log(greyText("> Change directories:"),  cyanText(`cd ${directory}`))
        console.log(greyText("> Start dev server:"),  cyanText(`${npx} run dev`))
        console.log(greyText("> Deploy application:"),  cyanText(`${npx} run deploy`))
        console.log()
    } else if (template == "d1-drizzle") {
        const { d1Name } = await prompts([
            {
                type: "text",
                name: "d1Name",
                onState,
                message: "Name of the D1 database (must be unique on your Cloudflare account)",
                validate: (val) =>
                    slugPattern.test(val) || "Database name must be alphanumeric separated by hyphens (-)",
            },
        ])

        const wranglerFile = readFile(`${directory}/wrangler.toml`)
        const packageFile = readFile(`${directory}/package.json`)
        writeFile(`${directory}/wrangler.toml`, wranglerFile.replace(/<TBD_D1NAME>/, d1Name))
        writeFile(`${directory}/package.json`, packageFile.replace(/<TBD_D1NAME>/, d1Name))
        console.log(greenText("√"), "Updated wrangler.toml and package.json with D1 database name")

        console.log()
        console.log("🚣", boldText("Extra setup required, must be completed before deployment"))
        console.log(greyText("> Change directories:"),  cyanText(`cd ${directory}`))
        console.log(greyText("> Create the D1 database via Wrangler:"),  cyanText(`npx wrangler d1 create ${d1Name}`))
        console.log(greyText("> Update the D1 database ID in"), greenText("wrangler.toml (under [[d1_databases]])"))
        console.log()
        console.log("💻", boldText("After setup completion, start developing"))
        console.log(greyText("> Start dev server:"),  cyanText(`${npx} run dev`))
        console.log(greyText("> Deploy application:"),  cyanText(`${npx} run deploy`))
        console.log(greyText("> Detect and generate migrations:"),  cyanText(`${npx} run migrations:generate`))
        console.log(greyText("> Apply migrations to local database:"),  cyanText(`${npx} run migrations:apply`))
        console.log(greyText("> Apply migrations to deployed database:"),  cyanText(`${npx} run migrations:apply --remote`))
        console.log()
    }

}

main()
