const { exec } = require("child_process");
const axios = require('axios');
const fs = require('fs');
const YAML = require('yamljs');
const { test } = require("gray-matter");

const githubAccountUri = 'https://api.github.com/users/ohdsi-studies/repos';
let repositories = [];



main();



async function main() {

  repositories = await getRepositoriesFrom(githubAccountUri)
  console.log(`Found ${repositories.length} repositories.\n`)
  
  let addedCounter = 0

  for (const [index, repository] of repositories.entries()) {
    // if( index<1 ) { 
    console.log(`Scrape Repo #${index + 1} - ${repository.name}`)
    await scrapeRepository(repository)
    // }
  }
  console.log(`\nScraped total number of ${repositories.length} repositories. Added ${addedCounter} with tag "COVID-19" to content.`)
}

async function getRepositoriesFrom(githubAccountUri) {
  const repos = []
  try {
    const reposResult = await axios.get(githubAccountUri);
    for (var i = 0; i < reposResult.data.length; i++) {
      const repo = {
        name: reposResult.data[i].name,
        rawReadmeUrl: `https://raw.githubusercontent.com/${reposResult.data[i].full_name}/master/README.md`,
        description: reposResult.data[i].description,
      }
      repos.push(repo);
    }
  } catch (error) {
    console.log(error.message);
  }
  return repos
} 

async function scrapeRepository(repository) {
  let response;
  try {
    response = await axios.get(repository.rawReadmeUrl);
  } catch (error) {
    console.log(error.message)
    return error
  }
  const html = response.data;
  const linesArray = html.split(/\r?\n/g)
  const extData = {}

  let hCounter = 0;
  let endOfList = 1000;

  const description = [];
  for (let i = 0; i < linesArray.length; i++) {
    if (hCounter > 1) break;
    const line = linesArray[i];
    if (line === "") continue;
    if (linesArray[i + 1].indexOf("===") === 0 || line.indexOf("#") === 0) {
      hCounter++;
      if (hCounter === 1) {
        extData.title = line
      }
      continue;
    }
    if (line.toLowerCase().indexOf('Analytics use case(s):'.toLowerCase()) !== -1) {
      extData.study_usecase = scrapeArrayOfUseCaseFrom(line)
    } else if (line.toLowerCase().indexOf('Study type:'.toLowerCase()) !== -1) {
      extData.study_type = scrapeArrayOfStudyTypeFrom(line) //this.scrapeStringFrom(line)
    } else if (line.toLowerCase().indexOf('Tags:'.toLowerCase()) !== -1) {
      extData.tags = this.scrapeArrayOfStringFrom(line)
    } else if (line.toLowerCase().indexOf('Study lead:'.toLowerCase()) !== -1) {
      extData.leads = this.scrapeArrayOfStringFrom(line)
    } else if (line.toLowerCase().indexOf('Study lead forums tag:'.toLowerCase()) !== -1) {
      extData.leadForumTags = this.scrapeArrayOfLinkFrom(line)
    } else if (line.toLowerCase().indexOf('Study start date:'.toLowerCase()) !== -1) {
      extData.startDate = this.scrapeStringFrom(line)
    } else if (line.toLowerCase().indexOf('Study end date:'.toLowerCase()) !== -1) {
      extData.endDate = this.scrapeStringFrom(line)
    } else if (line.toLowerCase().indexOf('Protocol:'.toLowerCase()) !== -1) {
      extData.protocol = this.scrapeLinkFrom(line)
    } else if (line.toLowerCase().indexOf('Publications:'.toLowerCase()) !== -1) {
      extData.publications = this.scrapeArrayOfLinkFrom(line)
    } else if (line.toLowerCase().indexOf('Results explorer:'.toLowerCase()) !== -1) {
      // get all lines after
      i++;
      if (linesArray[i].trim().indexOf('-') === 0) {
        const results = [];
        while (linesArray[i].trim().indexOf('-') === 0) {
          results.push(linesArray[i])
          i++;
        }
        i--;
        endOfList = i;
        extData.results = this.scrapeArrayOfLinkFromListOf(results)
      } else {
        i--;
        endOfList = i;
        extData.results = this.scrapeArrayOfLinkFrom(line)
      }
    }
    if (i > endOfList) {
      description.push(line);
    }
  }

  if (extData.leadForumTags && extData.leadForumTags.length > 0) {
    const authors = extData.leadForumTags.map((item => item.name.replace('[', '').replace(']', '')));
    extData.authors = authors;
  } else {
    extData.authors = [];
  }

  extData.description = description.join('\n');

    //console.log(`End: Scrape Repo #${index} - ${item.name}`);
  if (extData.tags && extData.tags.includes('COVID-19')) {
    if (fs.existsSync(`../content/study/${repository.name}/index.md`)) {
      removeReadmePart(repository, extData)
    } else {
      exec(`cd .. && hugo new study/${repository.name}`, (error, data, getter) => {
        if (error) {
          return;
        }
        if (getter) {
          return;
        }
        removeReadmePart(repository, extData)
      });
    }
    console.log(`Added to content`);
    //addedCounter++;

    extData.authors.forEach(async(author) => {
      // create author
      if (fs.existsSync(`../content/authors/${author}/_index.md`)) {
        //removeAuthorReadmePart(item, extData)
      } else {
        exec(`cd .. && hugo new authors/${author}`, (error, data, getter) => {
          if (error) {
            return;
          }
          if (getter) {
            return;
          }
          //removeAuthorReadmePart(item, extData)
        });
        
        
      }
  
      const authorContent = await axios.get(`https://forums.ohdsi.org/u/${author}.json`);
      //console.log(authorContent.data)
      fs.writeFile(`../content/authors/${author}/generated.json`, JSON.stringify(authorContent.data),'utf8', (err) => {
        if(err){
          console.log("WriteFile Error",err)
        }
      })
    });
  
  } else {
    //console.log('does not have covid tag');
  }
}


removeReadmePart = (item, extData) => {
  fs.readFile(`../content/study/${item.name}/index.md`, 'utf8', function (err, data) {
    if (err) {
      return console.log(err);
    }
    const linesArray = data.split(/\r?\n/g)
    let resultArray = [];
    let startIndexOfReadme = 10000;
    let endIndexOfReadme = 0;
    linesArray.every((line, index) => {
      if (line.indexOf('from_readme') !== -1) {
        startIndexOfReadme = index;
      }
      if (index > startIndexOfReadme) {
        if (line === "") {
        } else {
          if (line.substr(0, 3) === '---') {
            endIndexOfReadme = index;
          } else if (line.substr(0, 1) === ' ' || line.substr(0, 1) === '-') {//line.indexOf(' ') === 0 || line.indexOf("-") === 0){
          } else {
            endIndexOfReadme = index;
          }
        }
      }
      return true
    })

    resultArray = [];

    linesArray.every((line, index) => {
      if (startIndexOfReadme !== 0 && endIndexOfReadme !== 0) {
        if (index >= startIndexOfReadme && index < endIndexOfReadme) {

        } else {
          if (line.substr(0, 3) === '---') { }
          else { resultArray.push(line) }
        }
      } else {
        if (line.substr(0, 3) === '---') { }
        else { resultArray.push(line) }
      }
      return true
    });
    const resultStr = resultArray.join('\n');
    const newReadme = { from_readme: extData }
    const yamlString = YAML.stringify(newReadme, 2, 2);
    const content = `---\n${resultStr}\n${yamlString}\n---`
    fs.writeFile(`../content/study/${item.name}/index.md`, content, 'utf8', function (err) {
      if (err) return console.log(err);
    });
  });

}

scrapeArrayOfStudyTypeFrom = (item) => {
  const output = [];
  const result = scrapeArrayOfStringFrom(item)
  result.forEach(element => {
    //console.log(element);
    switch (element.toLowerCase()) {
      case 'Clinical Application'.toLowerCase():
        output.push(0);
        break;
      case 'Methods Research'.toLowerCase():
        output.push(1);
        break;
    }
  });

  return output;
}

scrapeArrayOfUseCaseFrom = (item) => {
  const output = [];
  const result = scrapeArrayOfStringFrom(item)
  result.forEach(element => {
    switch (element.toLowerCase()) {
      case 'Characterization'.toLowerCase():
        output.push(0);
        break;
      case 'Population-Level Estimation'.toLowerCase():
        output.push(1);
        break;
      case 'Patient-Level Prediction'.toLowerCase():
        output.push(2);
        break;
      case 'Characterization and Population-Level Estimation'.toLowerCase():
        output.push(3);
        break;
    }
  });

  return output;
}


scrapeArrayOfLinkFromListOf = (items) => {
  const result = []
  items.forEach(item => {
    result.push(generateObjectofNameAndUrlFrom(item))
  });
  return result;
}

scrapeArrayOfLinkFrom = (str) => {
  let result = cleanTextWithColon(str);
  if (result === "") return [];
  result = result.split(", ");
  return result.map(item => generateObjectofNameAndUrlFrom(item));
}

scrapeArrayOfStringFrom = (str) => {
  let result = cleanTextWithColon(str);
  if (result === "") return [];
  return result.split(", ");
}

scrapeLinkFrom = (str) => {
  const result = cleanTextWithColon(str);
  return generateObjectofNameAndUrlFrom(result);
}

scrapeStringFrom = (str) => {
  return cleanTextWithColon(str);
}

generateObjectofNameAndUrlFrom = (str) => {
  if (!str) return {}
  let name = str
  let mainEntityofPage = ""
  if (str.match(/\[(.*)\]/)) {
    name = str.match(/\[(.*)\]/)[1]
    mainEntityofPage = str.match(/\((.*)\)/)[1]
  }
  return { name, mainEntityofPage }
}


cleanTextWithColon = (str) => {
  const result = str.substr(str.indexOf(":") + 1).trim().replace(/\*\*/g, '');
  if (result === "-") { return "" }
  return result;
}