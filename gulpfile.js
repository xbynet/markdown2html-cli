const gulp = require('gulp');
const markdown = require('gulp-markdown');
const livereload = require('gulp-livereload');
const renderer = new markdown.marked.Renderer();
const map = require('map-stream');
const hljs = require('./highlight.min.js');
const minimist = require('minimist');
const uuidv4 = require('uuid/v4');
const fs = require("fs");
const Mustache = require('mustache');

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
            var fileContents = file.contents.toString();
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

            cb(null, file);
        }))
        .pipe(gulp.dest('dist'))
        .pipe(livereload());
});

gulp.task('watch', ['tohtml'], function() {
    gulp.watch('./*.md', ['tohtml']);

    livereload.listen();
    /*   gulp.watch(['dist/**'], function() {
          livereload();
      }); */
});