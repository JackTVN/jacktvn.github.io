let currentPage = "general";

$(function(){
    $(".professional").mouseenter(
        function(){
            currentPage = "pro"

            $(".personal .buttonMain").stop()
            $(".personal .buttonDesc").stop()
            $(".personal").stop()
            $(".professional").stop()
            $(".main").stop()
            $(".professionalPage").stop()
            $(".personalPage").stop()

            $(".personal .buttonMain").animate({marginRight: "-50vw"}, 300)
            $(".personal .buttonDesc").animate({marginRight: "-50vw"}, 300)
            $(".personal").animate({width: "0%"}, 300)
            $(".professional").animate({width: "60%"}, 300)
            $(".main").animate({left: "100%"}, 300)
            $(".professionalPage").animate({left: "0%"}, 300)
            $(".personalPage").animate({left: "100%"}, 300)
        } 
    )
    $(".personal").mouseenter(
        function(){
            currentPage = "personal"

            $(".professional .buttonMain").stop()
            $(".professional .buttonDesc").stop()
            $(".personal").stop()
            $(".professional").stop()
            $(".main").stop()
            $(".professionalPage").stop()
            $(".personalPage").stop()

            $(".professional .buttonMain").animate({marginLeft: "-50vw"}, 300)
            $(".professional .buttonDesc").animate({marginLeft: "-50vw"}, 300)
            $(".professional").animate({width: "0%"}, 300)
            $(".personal").animate({width: "60%"}, 300)
            $(".main").animate({left: "-100%"}, 300)
            $(".professionalPage").animate({left: "-100%"}, 300)
            $(".personalPage").animate({left: "0%"}, 300)
        }
    )
    $(".general").mouseenter(
        function(){
            currentPage = "general"

            $(".personal .buttonMain").stop()
            $(".personal .buttonDesc").stop()
            $(".professional .buttonMain").stop()
            $(".professional .buttonDesc").stop()
            $(".personal").stop()
            $(".professional").stop()
            $(".main").stop()
            $(".professionalPage").stop()
            $(".personalPage").stop()

            $(".personal .buttonMain").animate({marginRight: "0vw"}, 300)
            $(".personal .buttonDesc").animate({marginRight: "0vw"}, 300)
            $(".professional .buttonMain").animate({marginLeft: "0vw"}, 300)
            $(".professional .buttonDesc").animate({marginLeft: "0vw"}, 300)
            $(".personal").animate({width: "30%"}, 300)
            $(".professional").animate({width: "30%"}, 300)
            $(".main").animate({left: "0%"}, 300)
            $(".professionalPage").animate({left: "-100%"}, 300)
            $(".personalPage").animate({left: "100%"}, 300)
        }
    )
});
/*
function(){
    $(".professional").stop()
    $(".personal").stop()
    $(".personal .buttonMain").stop()
    $(".personal .buttonDesc").stop()
    $(".personal .buttonMain").animate({marginRight: "0vw"}, 300)
    $(".personal .buttonDesc").animate({marginRight: "0vw"}, 300)
    $(".personal").animate({width: "33%"}, 300)
    $(".professional").animate({width: "33%"}, 300)
}
function(){
            $(".professional").stop()
            $(".personal").stop()
            $(".professional .buttonMain").stop()
            $(".professional .buttonDesc").stop()
            $(".professional .buttonMain").animate({marginLeft: "0vw"}, 300)
            $(".professional .buttonDesc").animate({marginLeft: "0vw"}, 300)
            $(".professional").animate({width: "33%"}, 300)
            $(".personal").animate({width: "33%"}, 300)
        }
*/