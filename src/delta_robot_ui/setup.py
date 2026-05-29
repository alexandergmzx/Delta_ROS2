from glob import glob
import os

from setuptools import find_packages, setup


package_name = "delta_robot_ui"


def frontend_dist_data_files():
    data_files = []
    for root, _, files in os.walk("frontend/dist"):
        if files:
            data_files.append(
                (
                    os.path.join("share", package_name, root),
                    [os.path.join(root, file_name) for file_name in files],
                )
            )
    return data_files

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["test"]),
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
        (os.path.join("share", package_name, "config"), glob("config/*.yaml")),
        (os.path.join("share", package_name, "launch"), glob("launch/*.launch.py")),
    ] + frontend_dist_data_files(),
    package_data={package_name: ["static/*.html", "static/*.css", "static/*.js"]},
    include_package_data=True,
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="Alexander Gomez",
    maintainer_email="alexander@example.com",
    description="Python web dashboard for the Delta robot simulation.",
    license="TODO: License declaration",
    scripts=["scripts/delta_robot_dashboard"],
)