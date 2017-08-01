var path = require('path');
var fs = require('fs');
var join = path.join;
var gulp = require('gulp');
var markdown = require('gulp-markdown');
var livereload = require('gulp-livereload');
var renderer = new markdown.marked.Renderer();
var map = require('map-stream');
var hljs = require('./highlight.min.js');
var minimist = require('minimist');
var async = require('async');
const Mustache = require('mustache');
const uuidv4 = require('uuid/v4');

var BosClient = require('bce-sdk-js').BosClient;

var bucket = '';

const config = {
    endpoint: 'http://gz.bcebos.com', //传入Bucket所在区域域名
    credentials: {
        ak: '', //您的AccessKey
        sk: '' //您的SecretAccessKey
    }
};

let client = new BosClient(config);

var argsObj = minimist(process.argv.slice(3), {
    string: ['path', 'title'],
    default: {
        'path': 'index.md',
        'title': 'index'
    }
})
var mdPath = argsObj.path ? argsObj.path : 'index.md';
var title = argsObj.title ? argsObj.title : 'index';
console.log('the arg path is:' + mdPath + ", the arg title is:" + title);

var tocmodel = [];
var toplevel = null;

function pushLevel(model, level, escapedText) {
    if (model[model.length - 1].level == level) {
        model.push({ level: level, name: escapedText, sub: [] });
    } else {
        var parentLevel = model[model.length - 1].level;
        var sub = model[model.length - 1].sub;
        if (parentLevel + 1 < level && sub.length == 0) {
            console.log('不支持跳级,请按层级结构定义!!!');
            return;
        }
        if (sub.length == 0 || sub[sub.length - 1].level == level) { //sub为空或者与sub中元素同级，直接添加。
            sub.push({ level: level, name: escapedText, sub: [] });
        } else {
            pushLevel(sub, level, escapedText);
        }
    }
}

function fmtToc(model, isFirst, name) {
    var tmp = null;
    if (isFirst) {
        tmp = '<ul class="list-unstyled components">';
    } else {
        var id = uuidv4();
        tmp = '<li><a href="#' + id + '" data-toggle="collapse" aria-expanded="false">' + name + '</a><ul class="collapse list-unstyled" id="' + id + '"><li><a href="#' + name + '">' + name + '</a></li>';
    }
    if (model.length > 0) {
        model.forEach(function(e, i) {
            var tt = null;
            if (e.sub.length > 0) {
                tt = fmtToc(e.sub, false, e.name);
            } else {
                tt = '<li><a href="#' + e.name + '">' + e.name + '</a></li>';
            }
            tmp = tmp + tt;
        });
    }

    return isFirst ? tmp + '</ul>' : tmp + '</ul></li>';
}



/**
 * 
 * @param startPath  起始目录文件夹路径
 * @returns {Array}
 */
function findSync(startPath) {
    let result = [];

    function finder(path) {
        let files = fs.readdirSync(path);
        files.forEach((val, index) => {
            let fPath = join(path, val);
            let stats = fs.statSync(fPath);
            if (stats.isDirectory()) finder(fPath);
            if (stats.isFile()) result.push(fPath);
        });

    }
    finder(startPath);
    return result;
}

renderer.heading = function(text, level) {
    var escapedText = text.toLowerCase().replace(/[^a-zA-Z\u4e00-\u9fa5]+/g, '-');
    if (level > 1) {
        //level==1当作题目，忽略
        if (!toplevel || tocmodel.length == 0) {
            toplevel = level
            tocmodel.push({ level: level, name: escapedText, sub: [] });
        } else {
            pushLevel(tocmodel, level, escapedText);
        }
    }
    return '<h' + level + '><a name="' +
        escapedText +
        '" class="anchor" href="#' +
        escapedText +
        '"><span class="header-link"></span></a>' +
        text + '</h' + level + '>';
}

var options = {
    highlight: function(code) {
        return hljs.highlightAuto(code).value;
    },
    renderer: renderer
}


var styleDefaultData = fs.readFileSync("style.css", "utf-8");
var templateHtml = fs.readFileSync('template.html', 'utf-8');
var styleCustomData = '.code{padding: 2px 4px;font-size: 90%;color: #c7254e;background-color: #f9f2f4;border-radius: 4px;}';

gulp.task('tohtml', function() {
    return gulp.src(mdPath)
        .pipe(markdown(options))
        .pipe(map(function(file, cb) {
            var tpath = file.path;

            var key;
            if (tpath.endsWith('README.md') || tpath.endsWith('README.html')) {
                key = 'index.html';
            } else {
                if (tpath.contains(path.sep + 'dist' + path.sep + 'data' + path.sep)) {
                    key = tpath.substring(tpath.indexOf(path.sep + 'data' + path.sep) + 1).replace(/\\/g, '/');
                } else if (tpath.contains(path.sep + 'pages' + path.sep)) {
                    key = tpath.substring(tpath.indexOf(path.sep + 'pages' + path.sep) + 1).replace(/\\/g, '/');
                }
                key = key.replace('.md', '.html');
            }

            var fileContents = file.contents.toString();
            fileContents = fileContents.replace(/\/pages\/(.*?)\.md/gm, function(match, p1, offset, string) {
                return '/pages/' + p1 + '.html';
            });
            fileContents = Mustache.render(templateHtml, {
                title: title,
                content: fileContents,
                toc: fmtToc(tocmodel, true),
                styleDefault: styleDefaultData,
                styleCustom: styleCustomData
            });
            file.contents = new Buffer(fileContents);

            //清空历史数据
            tocmodel = [];
            toplevel = null;

            upload(key, fileContents);
            cb(null, file);
        }))
        .pipe(gulp.dest('dist'))
        .pipe(livereload())
        .on('end', function() {
            //
        });
});

gulp.task('upload', ['tohtml'], function() {
    var paths = findSync(fs.realpathSync('./dist'));
    // console.log(paths);
    var actions = [];
    paths.forEach(function(e, i) {
        var tpath = e;
        var key = tpath;
        if (tpath.endsWith('README.md') || tpath.endsWith('README.html')) {
            key = 'index.html';
        } else {
            if (tpath.indexOf(path.sep + 'dist' + path.sep + 'data' + path.sep) >= 0) {
                key = tpath.substring(tpath.indexOf(path.sep + 'data' + path.sep) + 1).replace(/\\/g, '/');
            } else if (tpath.indexOf(path.sep + 'pages' + path.sep) >= 0) {
                key = tpath.substring(tpath.indexOf(path.sep + 'pages' + path.sep) + 1).replace(/\\/g, '/');
            }
            key = key.replace('.md', '.html');
        }
        actions.push(function(cb) {
            // 以文件形式上传，仅支持Node.js环境
            client.putObjectFromFile(bucket, key, tpath)
                .then(() => {
                    console.log(key + 'uploaded');
                    cb(null, '')
                })
                .catch((err) => {
                    console.log(key + 'failed');
                    cb(null, '')
                });
        });

    });
    async.series(actions, function(error, res) {

    });
});

function upload() {

}
gulp.task('watch', ['tohtml'], function() {
    gulp.watch('./*.md', ['tohtml']);

    livereload.listen();
    /*   gulp.watch(['dist/**'], function() {
          livereload();
      }); */
});