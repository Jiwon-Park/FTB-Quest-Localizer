import fs from "fs";
import inquirer from "inquirer";
import Translator from "./modules/translate.js";
import langs from "./langs.js";
import JSZip from "jszip";
import dotenv from "dotenv";

dotenv.config();

async function questExtract(chapterFile, modPackName, isTranslate, targetLang, targetLocale) {
  const chapter = chapterFile.replace(".snbt", "");
  const questChapter = fs
    .readFileSync(`./ftbquests/quests/chapters/${chapterFile}`, "utf-8")
    .replaceAll('\\"', "'");

  !fs.existsSync(`./output/${modPackName}/chapters`) &&
    fs.mkdirSync(`./output/${modPackName}/chapters`, { recursive: true });

  let rewriteChapter = questChapter;
  let lang = {};
  let translatedLang = {};

  const titleRegex = /\btitle: \"[\s\S.]*?\"/gm;
  const subTitleRegex = /\bsubtitle: \[?\"[\s\S.]*?\"\]?/gm;
  const descRegex = /\bdescription: \[[\s\S.]*?\]/gm;
  const imageRegex = /^{image:[0-9a-zA-Z]*:.*}$/gm;
  const colorCodeRegex = /&[0-9A-FK-OR]/gim;

  const titles = questChapter.match(titleRegex);
  const subTitles = questChapter.match(subTitleRegex);
  const descriptions = questChapter.match(descRegex);

  if (!titles && !subTitles && !descriptions) return;

  const getString = (text, part) => {
    const stringRegex = /(?<=("))(?:(?=(\\?))\2.)*?(?=\1)/gm;
    return text
      .replace(`${part}: `, "")
      .toString()
      .replaceAll('""', "")
      .match(stringRegex);
  };

  const removeEmpty = (array) => {
    return array.filter((e) => e);
  };

  const addQuotes = (match) => {
    return '"' + match + '"';
  };

  const convert = (array, part) => {
    return new Promise(async (resolve) => {
      const sourceStrings = removeEmpty(
        array.flatMap((el) => getString(el, `${part}`))
      );
      const translator = new Translator();
      translator.initDeepL(process.env.DEEPL_AUTH_KEY);

      let translatedStrings;
      if (isTranslate) {
        translatedStrings = await Promise.all(
          sourceStrings.map((sourceString) => {
            if (sourceString.match(imageRegex)) {
              return sourceString;
            }
            return translator.deeplTranslate(
              sourceString.replace(colorCodeRegex, addQuotes),
              targetLang
            );
          })
        );
      }
      sourceStrings.map((sourceString, i) => {
        rewriteChapter = rewriteChapter.replace(
          `"${sourceString}"`,
          `"{${modPackName}.${chapter}.${part}${i}}"`
        );

        if (isTranslate) {
          const translatedString = translatedStrings[i];
          translatedLang = {
            ...translatedLang,
            [`${modPackName}.${chapter}.${part}${i}`]: translatedString,
          };
        }

        lang = {
          ...lang,
          [`${modPackName}.${chapter}.${part}${i}`]: sourceString,
        };
      });
      resolve();
    });
  };

  if (titles) {
    await convert(titles, "title");
  }
  if (subTitles) {
    await convert(subTitles, "subtitle");
  }
  if (descriptions) {
    await convert(descriptions, "description");
  }

  fs.writeFileSync(
    `./output/${modPackName}/chapters/${chapterFile}`,
    rewriteChapter
  );

  if (fs.existsSync(`./output/${modPackName}/en_us.json`)) {
    const langFile = fs.readFileSync(
      `./output/${modPackName}/en_us.json`,
      "utf-8"
    );
    lang = { ...lang, ...JSON.parse(langFile) };
    fs.writeFileSync(
      `./output/${modPackName}/en_us.json`,
      JSON.stringify(lang, null, 2)
    );
  } else {
    fs.writeFileSync(
      `./output/${modPackName}/en_us.json`,
      JSON.stringify(lang, null, 2)
    );
  }

  if (isTranslate) {
    if (fs.existsSync(`./output/${modPackName}/${targetLang}_${targetLocale}.json`)) {
      const langFile = fs.readFileSync(
        `./output/${modPackName}/${targetLang}_${targetLocale}.json`,
        "utf-8"
      );
      translatedLang = { ...translatedLang, ...JSON.parse(langFile) };
      fs.writeFileSync(
        `./output/${modPackName}/${targetLang}_${targetLocale}.json`,
        JSON.stringify(translatedLang, null, 2)
      );
    } else {
      fs.writeFileSync(
        `./output/${modPackName}/${targetLang}_${targetLocale}.json`,
        JSON.stringify(translatedLang, null, 2)
      );
    }
    const zip = new JSZip();
    const mcmeta = {"pack": {"pack_format": 15, "description": `${modPackName} FTBQuest ${targetLang}_${targetLocale} translation pack`}}
    zip.file("pack.mcmeta", JSON.stringify(mcmeta));
    const lang = zip.folder("assets").folder("kubejs").folder("lang")
    lang.file(`${targetLang}_${targetLocale}.json`, fs.readFileSync(`./output/${modPackName}/${targetLang}_${targetLocale}.json`, "utf-8"))
    lang.file("en_us.json", fs.readFileSync(`./output/${modPackName}/en_us.json`, "utf-8"))
    zip.generateAsync({type:"nodebuffer"}).then(function(content) {
      fs.writeFileSync(`./output/${modPackName}/${modPackName}ResourcePack_${targetLang}_${targetLocale}.zip`, content);
    });
  }
  console.log(`${chapterFile} done`);
}

function run(modPackName, isTranslate, targetLang, targetLocale) {
  fs.readdir(`./ftbquests/quests/chapters`, function (err, fileLists) {
    if (err) {
      return console.error("'./ftbquests/quests/chapters' directory not found");
    }
    fileLists.map((file) =>
      questExtract(file, modPackName, isTranslate, targetLang, targetLocale)
    );
  });
}

function prompt() {
  return inquirer.prompt([
    {
      name: "modPackName",
      message: `Enter the modpack name to display in the json key:`,
      type: "input",
      filter: (value) => {
        const valid = /[~"#%&*:<>?/\\{|}]+/gm;
        const result = value.replace(valid, "");
        return result;
      },
      validate: (value) => {
        if (!value) {
          return "Modpack name is required";
        } else {
          return true;
        }
      },
    },
    {
      name: "isTranslate",
      message:
        "Do you also output machine translated(with Google Translate) files?",
      type: "confirm",
    },
    {
      name: "targetLang",
      message: "Enter target language (e.g. en, ko, es):",
      type: "input",
      when: (answers) => {
        if (answers.isTranslate === true) {
          return true;
        }
      },
      validate: (value) => {
        if (langs.includes(value)) {
          return true;
        } else {
          return "Language not supported";
        }
      },
    },
    {
        name: "targetLocale",
        message: "Enter target locale (e.g. us, kr, es):",
        type: "input",
        when: (answers) => {
          if (answers.isTranslate === true) {
            return true;
        }
      }
    },
  ]);
}

(async () => {
  console.info(
    "Extracts text from chapter files to converts them for easy localization"
  );
  console.info(
    "The root directory must have the ftbquests directory to extract"
  );
  console.info("Output is created in the output directory");
  const answers = await prompt();
  run(answers.modPackName, answers.isTranslate, answers.targetLang, answers.targetLocale);
})();
