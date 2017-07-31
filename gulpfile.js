var gulp = require('gulp');
var markdown = require('gulp-markdown');
var livereload = require('gulp-livereload');
var renderer = new markdown.marked.Renderer();
var map = require('map-stream');
var hljs = require('./highlight.min.js');

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

function fmtToc(model) {
    var tmp = '<ol class="order">'
    if (model.length > 0) {
        model.forEach(function(e, i) {
            var tt = '<li class="order"><a href="#' + e.name + '" >' + e.name + '</a>';
            if (e.sub.length > 0) {
                tt = tt + fmtToc(e.sub) + '</li>';
            } else {
                tt = tt + '</li>';
            }
            tmp = tmp + tt;
        });
    }
    return tmp + '</ol>';
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


gulp.task('tohtml', function() {
    return gulp.src('index.md')
        .pipe(markdown(options))
        .pipe(map(function(file, cb) {
            var fileContents = file.contents.toString();
            fileContents = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>index</title>' +
                '<link rel="stylesheet" href="https://cdn.bootcss.com/highlight.js/9.12.0/styles/vs.min.css"><script src="https://cdn.bootcss.com/highlight.js/9.12.0/highlight.min.js"></script><script src="https://cdn.bootcss.com/jquery/3.2.1/jquery.min.js"></script>' +
                '<style>.code{padding: 2px 4px;font-size: 90%;color: #c7254e;background-color: #f9f2f4;border-radius: 4px;} .post{ margin-left: 380px;padding-top: 20px;padding-bottom: 60px;width: 960px;}' +
                ' ol.order{ counter-reset: item } li.order{ display: block } li.order:before { content: counters(item, ".") " "; counter-increment: item } ' +
                ' .toc{position:fixed;width:350px;left:20px;top:20px;bottom:20px;height 600px;overflow-y:scroll;}' +
                '</style>' +
                '</head><body><div class="toc"><h3>目录：</h3>' + fmtToc(tocmodel) + '</div><div class="post">' +
                fileContents +
                '</div><script>hljs.initHighlightingOnLoad();$("li>code,p > code").addClass("code");' +
                '</script></body></html>';
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