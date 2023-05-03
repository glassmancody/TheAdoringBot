import chalk from "chalk";

const Log = {
  info: (msg) => {
    console.log(chalk.bold.magenta(msg));
  },
  warn: (msg) => {
    console.log(chalk.bold.yellow(msg));
  },
  error: (msg) => {
    console.log(chalk.bold.redBright(msg));
  },
  message: (msg) => {
    console.log(chalk.italic.blue(msg));
  },
};

export default Log;
